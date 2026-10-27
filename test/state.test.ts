import { describe, expect, test } from "bun:test";
import { isInsideTeamDir, parsePlanProgress } from "../src/state";

describe("parsePlanProgress", () => {
	test("counts numbered tasks and F-items, ignoring template examples in code fences", () => {
		const plan = [
			"# Plan",
			"```markdown",
			"- [ ] 1. Example from the template — category: deep",
			"```",
			"## TODOs",
			"- [x] 1. Add parser — category: deep — wave: 1",
			"  - Files: a.ts",
			"  - [ ] nested sub-step without an id is not tracked",
			"- [ ] 2. Wire command — category: quick — wave: 2",
			"* [X] 3. Docs — category: writing",
			"## Final verification",
			"- [ ] F1. Whole-change review",
			"- [x] F2. Verification strategy green",
		].join("\n");

		const progress = parsePlanProgress(plan);

		expect(progress.total).toBe(5);
		expect(progress.done).toBe(3);
		expect(progress.remaining).toEqual([
			{ id: "2", title: "Wire command", done: false },
			{ id: "F1", title: "Whole-change review", done: false },
		]);
	});

	test("a plan without tracked rows has zero total", () => {
		expect(parsePlanProgress("# Notes\n- [ ] free-form checkbox").total).toBe(0);
	});
});

describe("isInsideTeamDir", () => {
	test("accepts relative and absolute paths under .omp/team and rejects escapes", () => {
		expect(isInsideTeamDir("/repo", ".omp/team/plans/x.md")).toBe(true);
		expect(isInsideTeamDir("/repo", "/repo/.omp/team/drafts/x.md")).toBe(true);
		expect(isInsideTeamDir("/repo", ".omp/team/../config.yml")).toBe(false);
		expect(isInsideTeamDir("/repo", "src/index.ts")).toBe(false);
		expect(isInsideTeamDir("/repo", ".omp/teamwork/x.md")).toBe(false);
	});
});
