import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "./config";
import { describeChain, filterDisabled, loadTeamAgentModels, PLANNER_MODELS } from "./models";
import { conductorPrompt, plannerPrompt, ultraworkPrompt } from "./prompts";
import { isInsideTeamDir, listPlans, readBoulder, readPlanProgress, teamPaths, writeBoulder } from "./state";

type ThinkingLevel = Parameters<ExtensionAPI["setThinkingLevel"]>[0];

type Mode =
	| { kind: "idle" }
	| { kind: "planning"; restoreModel?: string; restoreThinking?: ThinkingLevel }
	| { kind: "executing"; slug: string; lastDone: number; stalls: number };

const MODE_ENTRY = "omp-multi-agent/mode";
const STATUS_KEY = "team";
const WAITING_MARKER = "TEAM_WAITING";
const ULTRAWORK = /\b(?:ultrawork|ulw)\b/i;
/** Planner may write only drafts/plans; these tools mutate files and are checked against `.omp/team/`. */
const GUARDED_TOOLS: Record<string, true> = { write: true, edit: true, ast_edit: true, notebook: true };

const TEAM_AGENTS = loadTeamAgentModels(path.join(import.meta.dir, "..", "agents"));

/** Paths an `edit`/`write`/`ast_edit` call targets, or undefined when they cannot be determined. */
function targetPaths(input: object): string[] | undefined {
	const fields: Record<string, unknown> = Object.fromEntries(Object.entries(input));
	const paths: string[] = [];
	for (const key of ["path", "file", "file_path", "notebook_path"]) {
		const value = fields[key];
		if (typeof value === "string") paths.push(value);
	}
	// Hashline edit bodies address files as `[PATH#TAG]` section headers.
	const body = fields.input;
	if (typeof body === "string") {
		for (const match of body.matchAll(/^\[(.+?)#[0-9A-Fa-f]{4}\]\s*$/gm)) paths.push(match[1]!);
	}
	return paths.length > 0 ? paths : undefined;
}

function isMode(value: unknown): value is Mode {
	if (!value || typeof value !== "object" || !("kind" in value)) return false;
	if (value.kind === "idle" || value.kind === "planning") return true;
	return value.kind === "executing" && "slug" in value && typeof value.slug === "string";
}

/** Whether the settling turn was interrupted, and its visible text. */
function inspectStop(message: AgentMessage | undefined): { aborted: boolean; text: string } {
	if (message?.role !== "assistant") return { aborted: false, text: "" };
	const text = message.content
		.flatMap(block => (block.type === "text" ? [block.text] : []))
		.join("\n");
	return { aborted: message.stopReason === "aborted", text };
}

export default function ompMultiAgent(pi: ExtensionAPI) {
	let mode: Mode = { kind: "idle" };

	function setMode(next: Mode, ctx: ExtensionContext) {
		mode = next;
		pi.appendEntry(MODE_ENTRY, next);
		refreshStatus(ctx);
	}

	function refreshStatus(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		const text =
			mode.kind === "planning"
				? ctx.ui.theme.fg("warning", "team: planning")
				: mode.kind === "executing"
					? ctx.ui.theme.fg("accent", `team: ${mode.slug} ${mode.lastDone} done`)
					: undefined;
		ctx.ui.setStatus(STATUS_KEY, text);
	}

	function planPath(ctx: ExtensionContext, slug: string) {
		return path.join(teamPaths(ctx.cwd).plans, `${slug}.md`);
	}

	async function enterPlanning(ctx: ExtensionContext): Promise<string> {
		const config = await loadConfig(ctx.cwd);
		const next: Mode = { kind: "planning" };
		let note = "";
		if (config.plannerSwitchModel) {
			const target = describeChain(PLANNER_MODELS, ctx.models, config.disabledProviders).find(
				entry => entry.status === "ok",
			);
			const current = ctx.models.current();
			const restoreThinking = pi.getThinkingLevel();
			const model = target?.resolved ? ctx.models.resolve(target.resolved) : undefined;
			if (target && model && (await pi.setModel(model))) {
				// Validated by splitThinking against the known level names.
				if (target.thinking) pi.setThinkingLevel(target.thinking as ThinkingLevel);
				next.restoreModel = current ? `${current.provider}/${current.id}` : undefined;
				next.restoreThinking = restoreThinking;
				note = ` Planner model: ${target.label}.`;
			} else {
				note = " No planner model available; staying on the current model.";
			}
		}
		setMode(next, ctx);
		return note;
	}

	async function leavePlanning(ctx: ExtensionContext) {
		if (mode.kind !== "planning" || !mode.restoreModel) return;
		const model = ctx.models.resolve(mode.restoreModel);
		if (model) await pi.setModel(model);
		if (mode.restoreThinking) pi.setThinkingLevel(mode.restoreThinking);
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.agent.kind !== "main") return;
		const entry = ctx.sessionManager
			.getBranch()
			.findLast(e => e.type === "custom" && e.customType === MODE_ENTRY);
		if (entry?.type === "custom" && isMode(entry.data)) mode = entry.data;
		refreshStatus(ctx);
		const boulder = await readBoulder(ctx.cwd);
		if (boulder?.status === "executing" && mode.kind !== "executing" && ctx.hasUI) {
			const progress = await readPlanProgress(path.join(ctx.cwd, boulder.plan));
			if (progress && progress.done < progress.total) {
				ctx.ui.notify(
					`Team plan "${boulder.slug}" is ${progress.done}/${progress.total} done. Resume with /team-execute ${boulder.slug}.`,
					"info",
				);
			}
		}
	});

	// ── Prompt injection ───────────────────────────────────────────────────────
	pi.on("before_agent_start", async (event, ctx) => {
		if (ctx.agent.kind !== "main") return;
		const blocks: string[] = [];
		if (mode.kind === "planning") blocks.push(plannerPrompt(ctx.cwd));
		if (mode.kind === "executing") blocks.push(conductorPrompt(ctx.cwd, mode.slug, await loadConfig(ctx.cwd)));
		if (
			mode.kind !== "planning" &&
			event.reason === "prompt" &&
			ULTRAWORK.test(event.prompt) &&
			(await loadConfig(ctx.cwd)).ultraworkKeyword
		) {
			blocks.push(ultraworkPrompt());
		}
		if (blocks.length === 0) return;
		return { systemPrompt: [...event.systemPrompt, ...blocks] };
	});

	// ── Planner write guard ────────────────────────────────────────────────────
	pi.on("tool_call", async (event, ctx) => {
		if (mode.kind !== "planning" || ctx.agent.kind !== "main" || !GUARDED_TOOLS[event.toolName]) return;
		const targets = targetPaths(event.input);
		const outside = targets?.filter(p => !p.startsWith("local://") && !isInsideTeamDir(ctx.cwd, p));
		if (targets && outside?.length === 0) return;
		return {
			block: true,
			reason: `Team planner mode: writes are limited to .omp/team/ (blocked: ${outside?.join(", ") ?? "unknown target"}). Plan the change instead; implementation happens via /team-execute.`,
		};
	});

	// ── Model routing ──────────────────────────────────────────────────────────
	pi.on("before_subagent_spawn", async (event, ctx) => {
		if (!TEAM_AGENTS.has(event.agent)) return;
		const config = await loadConfig(ctx.cwd);
		if (config.disabledProviders.length === 0) return;
		const kept = filterDisabled(event.patterns, ctx.models, config.disabledProviders);
		if (kept.length === event.patterns.length) return;
		if (kept.length === 0) {
			return {
				block: true,
				reason: `omp-multi-agent: every model for "${event.agent}" is on a disabled provider (${config.disabledProviders.join(", ")}). Configure modelRoles.team-* or adjust disabledProviders.`,
			};
		}
		return { model: kept, note: `team: skipped disabled providers ${config.disabledProviders.join(", ")}` };
	});

	// ── Plan-execution continuation ────────────────────────────────────────────
	pi.on("session_stop", async (event, ctx) => {
		if (mode.kind !== "executing" || ctx.agent.kind !== "main") return;
		const stop = inspectStop(event.last_assistant_message);
		if (stop.aborted) return; // user interrupted: pause, keep mode
		if (stop.text.includes(WAITING_MARKER)) return;

		const progress = await readPlanProgress(planPath(ctx, mode.slug));
		if (!progress) return;
		if (progress.remaining.length === 0) {
			const boulder = await readBoulder(ctx.cwd);
			if (boulder) await writeBoulder(ctx.cwd, { ...boulder, status: "complete", updatedAt: new Date().toISOString() });
			if (ctx.hasUI) ctx.ui.notify(`Team plan "${mode.slug}" complete (${progress.total}/${progress.total}).`, "info");
			setMode({ kind: "idle" }, ctx);
			return;
		}

		const config = await loadConfig(ctx.cwd);
		const advanced = progress.done > mode.lastDone;
		const stalls = advanced ? 0 : mode.stalls + 1;
		setMode({ ...mode, lastDone: progress.done, stalls }, ctx);
		if (stalls > config.maxStalledNudges) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Team plan "${mode.slug}" stalled at ${progress.done}/${progress.total} after ${config.maxStalledNudges} nudges. Send a message to resume or /team-stop.`,
					"warning",
				);
			}
			return;
		}
		const remaining = progress.remaining
			.slice(0, 8)
			.map(item => `${item.id}. ${item.title}`)
			.join("; ");
		return {
			decision: "block",
			reason: [
				`[omp-multi-agent] Plan "${mode.slug}": ${progress.done}/${progress.total} checkboxes ticked. Remaining: ${remaining}${progress.remaining.length > 8 ? "; …" : ""}.`,
				"Continue with the next unticked task or wave now. Tick checkboxes only after verification.",
				`If you are genuinely blocked on a user decision, ask it with the ask tool; if you already asked in plain text and must wait, reply with exactly ${WAITING_MARKER}.`,
			].join("\n"),
		};
	});

	// ── Commands ───────────────────────────────────────────────────────────────
	pi.registerCommand("team-plan", {
		description: "Enter team planner mode (interview → plan → metis review). Optional: initial request.",
		handler: async (args, ctx) => {
			if (mode.kind === "executing") {
				ctx.ui.notify(`A plan is executing (${mode.slug}). /team-stop first.`, "warning");
				return;
			}
			const note = mode.kind === "planning" ? "" : await enterPlanning(ctx);
			const request = args.trim();
			if (request) {
				pi.sendUserMessage(request);
			} else {
				ctx.ui.notify(`Team planner mode on.${note} Describe what you want to build.`, "info");
			}
		},
	});

	pi.registerCommand("team-execute", {
		description: "Execute a team plan from .omp/team/plans (default: active or newest).",
		getArgumentCompletions: () => null,
		handler: async (args, ctx) => {
			const plans = await listPlans(ctx.cwd);
			const boulder = await readBoulder(ctx.cwd);
			let slug = args.trim().replace(/\.md$/, "");
			if (!slug && boulder?.status === "executing" && plans.includes(boulder.slug)) slug = boulder.slug;
			if (!slug && plans.length === 1) slug = plans[0]!;
			if (!slug && plans.length > 1 && ctx.hasUI) slug = (await ctx.ui.select("Execute which plan?", plans)) ?? "";
			if (!slug) {
				ctx.ui.notify("No plan found in .omp/team/plans. Create one with /team-plan.", "warning");
				return;
			}
			const file = planPath(ctx, slug);
			const progress = await readPlanProgress(file);
			if (!progress || progress.total === 0) {
				ctx.ui.notify(`Plan ${path.relative(ctx.cwd, file)} is missing or has no "- [ ] N." task rows.`, "error");
				return;
			}
			await leavePlanning(ctx);
			await fs.mkdir(path.join(teamPaths(ctx.cwd).notepads, slug), { recursive: true });
			const now = new Date().toISOString();
			await writeBoulder(ctx.cwd, {
				version: 1,
				slug,
				plan: path.relative(ctx.cwd, file),
				sessionId: ctx.sessionManager.getSessionId(),
				startedAt: boulder?.slug === slug ? boulder.startedAt : now,
				updatedAt: now,
				status: "executing",
			});
			setMode({ kind: "executing", slug, lastDone: progress.done, stalls: 0 }, ctx);
			pi.sendUserMessage(
				`Execute the team plan at ${path.relative(ctx.cwd, file)} (${progress.done}/${progress.total} already ticked). Follow conductor mode until every checkbox is ticked.`,
			);
		},
	});

	pi.registerCommand("team-stop", {
		description: "Leave team planner/conductor mode and stop plan continuation.",
		handler: async (_args, ctx) => {
			await leavePlanning(ctx);
			const boulder = await readBoulder(ctx.cwd);
			if (boulder?.status === "executing") {
				await writeBoulder(ctx.cwd, { ...boulder, status: "stopped", updatedAt: new Date().toISOString() });
			}
			const was = mode.kind;
			setMode({ kind: "idle" }, ctx);
			ctx.ui.notify(was === "idle" ? "Team mode was not active." : `Team ${was} mode stopped.`, "info");
		},
	});

	pi.registerCommand("team-status", {
		description: "Show team mode and plan progress.",
		handler: async (_args, ctx) => {
			const lines = [`Mode: ${mode.kind}${mode.kind === "executing" ? ` (${mode.slug})` : ""}`];
			for (const slug of await listPlans(ctx.cwd)) {
				const progress = await readPlanProgress(planPath(ctx, slug));
				if (!progress) continue;
				lines.push(`${slug}: ${progress.done}/${progress.total}`);
				if (mode.kind === "executing" && mode.slug === slug) {
					for (const item of progress.remaining.slice(0, 10)) lines.push(`  [ ] ${item.id}. ${item.title}`);
				}
			}
			const boulder = await readBoulder(ctx.cwd);
			if (boulder) lines.push(`Boulder: ${boulder.slug} — ${boulder.status} (updated ${boulder.updatedAt})`);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("team-models", {
		description: "Show which model each team agent resolves to.",
		handler: async (_args, ctx) => {
			const config = await loadConfig(ctx.cwd);
			const rows: string[] = [];
			const roster: [string, readonly string[]][] = [["planner (main)", PLANNER_MODELS], ...TEAM_AGENTS];
			for (const [name, patterns] of roster) {
				const chain = describeChain(patterns, ctx.models, config.disabledProviders);
				const chosen = chain.find(entry => entry.status === "ok");
				const fallbacks = chain
					.filter(entry => entry !== chosen)
					.map(entry => (entry.status === "ok" ? entry.label : `${entry.label} (${entry.status})`));
				rows.push(
					`${name.padEnd(15)} → ${chosen?.label ?? "NONE AVAILABLE"}${fallbacks.length ? `   fallbacks: ${fallbacks.join(", ")}` : ""}`,
				);
			}
			if (config.disabledProviders.length) rows.push(`Disabled providers: ${config.disabledProviders.join(", ")}`);
			rows.push("Override any agent with modelRoles.team-<role> (see /model → Roles) or task.agentModelOverrides.");
			ctx.ui.notify(rows.join("\n"), "info");
		},
	});
}
