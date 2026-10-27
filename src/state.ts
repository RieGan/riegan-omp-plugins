import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface TeamPaths {
	root: string;
	plans: string;
	drafts: string;
	notepads: string;
	boulder: string;
}

export function teamPaths(cwd: string): TeamPaths {
	const root = path.join(cwd, ".omp", "team");
	return {
		root,
		plans: path.join(root, "plans"),
		drafts: path.join(root, "drafts"),
		notepads: path.join(root, "notepads"),
		boulder: path.join(root, "boulder.json"),
	};
}

export interface PlanItem {
	id: string;
	title: string;
	done: boolean;
}

export interface PlanProgress {
	items: PlanItem[];
	total: number;
	done: number;
	remaining: PlanItem[];
}

// `- [ ] 3. Title …` and `- [x] F1. Title …` — the plan template's tracked checkbox rows.
const CHECKBOX_ROW = /^\s*[-*]\s+\[([ xX])\]\s+(F?\d+)\.\s+(.*)$/gm;

export function parsePlanProgress(markdown: string): PlanProgress {
	const items: PlanItem[] = [];
	for (const match of markdown.replace(/```[\s\S]*?```/g, "").matchAll(CHECKBOX_ROW)) {
		const [, mark, id, title] = match;
		items.push({ id: id!, title: title!.split(" — ")[0]!.trim(), done: mark !== " " });
	}
	const remaining = items.filter(item => !item.done);
	return { items, total: items.length, done: items.length - remaining.length, remaining };
}

export async function readPlanProgress(planPath: string): Promise<PlanProgress | undefined> {
	try {
		return parsePlanProgress(await fs.readFile(planPath, "utf8"));
	} catch {
		return undefined;
	}
}

/** Plan slugs, newest first. */
export async function listPlans(cwd: string): Promise<string[]> {
	const dir = teamPaths(cwd).plans;
	const names = await fs.readdir(dir).catch(() => [] as string[]);
	const entries = await Promise.all(
		names
			.filter(name => name.endsWith(".md"))
			.map(async name => ({ slug: name.slice(0, -3), mtime: (await fs.stat(path.join(dir, name))).mtimeMs })),
	);
	return entries.sort((a, b) => b.mtime - a.mtime).map(entry => entry.slug);
}

export interface Boulder {
	version: 1;
	slug: string;
	plan: string;
	sessionId: string;
	startedAt: string;
	updatedAt: string;
	status: "executing" | "stopped" | "complete";
}

export async function readBoulder(cwd: string): Promise<Boulder | undefined> {
	try {
		const data = JSON.parse(await fs.readFile(teamPaths(cwd).boulder, "utf8")) as Boulder;
		return data.version === 1 ? data : undefined;
	} catch {
		return undefined;
	}
}

export async function writeBoulder(cwd: string, boulder: Boulder): Promise<void> {
	const file = teamPaths(cwd).boulder;
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, `${JSON.stringify(boulder, null, "\t")}\n`);
}

/** True when `target` (absolute or cwd-relative) is inside `.omp/team/`. */
export function isInsideTeamDir(cwd: string, target: string): boolean {
	const rel = path.relative(teamPaths(cwd).root, path.resolve(cwd, target));
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
