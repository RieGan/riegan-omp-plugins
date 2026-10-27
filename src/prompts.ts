import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamConfig } from "./config";
import { teamPaths } from "./state";

const PROMPTS_DIR = path.join(import.meta.dir, "prompts");

function load(name: string): string {
	return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
}

const TEMPLATES = {
	routing: load("routing"),
	planner: load("planner"),
	conductor: load("conductor"),
	ultrawork: load("ultrawork"),
};

function render(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{([A-Z_]+)\}\}/g, (whole, key: string) => vars[key] ?? whole);
}

function rel(cwd: string, target: string): string {
	return path.relative(cwd, target) || ".";
}

export function plannerPrompt(cwd: string): string {
	const paths = teamPaths(cwd);
	return render(TEMPLATES.planner, {
		DRAFTS_DIR: rel(cwd, paths.drafts),
		PLANS_DIR: rel(cwd, paths.plans),
		DATE: new Date().toISOString().slice(0, 10),
		ROUTING: TEMPLATES.routing,
	});
}

export function conductorPrompt(cwd: string, slug: string, config: TeamConfig): string {
	const paths = teamPaths(cwd);
	const commit = config.commitPolicy === "per-task";
	return render(TEMPLATES.conductor, {
		PLAN_PATH: rel(cwd, path.join(paths.plans, `${slug}.md`)),
		NOTEPAD_DIR: rel(cwd, path.join(paths.notepads, slug)),
		REVIEW_POLICY: config.reviewPolicy,
		COMMIT_TICK: commit ? " and committed" : "",
		COMMIT_STEP: commit
			? "**Commit** the task's files only: `git add <its files>` then `git commit` with a message following the repository's conventions (check `git log`), e.g. `feat(scope): <task title>`. Never `git add -A` while other tasks are in flight; never amend, rebase, or push."
			: "**Do not commit.** Leave changes in the working tree for the user.",
		ROUTING: TEMPLATES.routing,
	});
}

export function ultraworkPrompt(): string {
	return render(TEMPLATES.ultrawork, { ROUTING: TEMPLATES.routing });
}
