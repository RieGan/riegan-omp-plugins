import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionModelQuery } from "@oh-my-pi/pi-coding-agent";

/** Main-session planner chain; the `@team-planner` role, when configured, wins. */
export const PLANNER_MODELS = ["@team-planner", "anthropic/claude-opus-5-5:xhigh", "zai/glm-5.3:max", "rg_ai/gpt-6.1-sol:high"];

const THINKING_LEVELS: Record<string, true> = {
	off: true,
	minimal: true,
	low: true,
	medium: true,
	high: true,
	xhigh: true,
	max: true,
	auto: true,
};

/** Team agent name → prioritized model patterns, read from the plugin's own `agents/*.md` frontmatter. */
export function loadTeamAgentModels(agentsDir: string): Map<string, string[]> {
	const agents = new Map<string, string[]>();
	for (const file of fs.readdirSync(agentsDir).filter(name => name.endsWith(".md")).sort()) {
		const text = fs.readFileSync(path.join(agentsDir, file), "utf8");
		const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
		if (!block) continue;
		const meta = Bun.YAML.parse(block) as { name?: unknown; model?: unknown };
		if (typeof meta.name !== "string") continue;
		const model = meta.model;
		const patterns = Array.isArray(model)
			? model.filter((entry): entry is string => typeof entry === "string")
			: typeof model === "string"
				? model.split(",").map(entry => entry.trim())
				: [];
		agents.set(meta.name, patterns);
	}
	return agents;
}

/** Split a trailing `:level` thinking suffix off a selector. */
export function splitThinking(pattern: string): { selector: string; thinking?: string } {
	const idx = pattern.lastIndexOf(":");
	if (idx > 0) {
		const level = pattern.slice(idx + 1);
		if (Object.hasOwn(THINKING_LEVELS, level)) return { selector: pattern.slice(0, idx), thinking: level };
	}
	return { selector: pattern };
}

export interface ChainEntry {
	pattern: string;
	/** `provider/id` of the resolved model, when it resolves. */
	resolved?: string;
	provider?: string;
	thinking?: string;
	/** `unset`: a `@role` alias with no `modelRoles` entry; `unavailable`: no authenticated model matches. */
	status: "ok" | "unset" | "unavailable" | "disabled";
	/** Human-readable `provider/id[:level]`, or the raw pattern when unresolved. */
	label: string;
}

export function describeChain(
	patterns: readonly string[],
	models: Pick<ExtensionModelQuery, "resolve">,
	disabledProviders: readonly string[],
): ChainEntry[] {
	return patterns.map(pattern => {
		const { selector, thinking } = splitThinking(pattern);
		const model = models.resolve(selector);
		if (!model) return { pattern, thinking, label: pattern, status: pattern.startsWith("@") ? "unset" : "unavailable" };
		const resolved = `${model.provider}/${model.id}`;
		return {
			pattern,
			resolved,
			provider: model.provider,
			thinking,
			label: thinking ? `${resolved}:${thinking}` : resolved,
			status: disabledProviders.includes(model.provider) ? "disabled" : "ok",
		};
	});
}

/** Patterns whose provider is disabled are removed; unresolvable ones are kept for core to judge. */
export function filterDisabled(
	patterns: readonly string[],
	models: Pick<ExtensionModelQuery, "resolve">,
	disabledProviders: readonly string[],
): string[] {
	if (disabledProviders.length === 0) return [...patterns];
	return describeChain(patterns, models, disabledProviders)
		.filter(entry => entry.status !== "disabled")
		.map(entry => entry.pattern);
}
