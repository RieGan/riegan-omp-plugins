import { describe, expect, test } from "bun:test";
import { routeReviewerChain } from "../src/routing";

interface FakeModel {
	provider: string;
	id: string;
}

/** Resolves `provider/id` selectors and configured `@role` aliases; family = id prefix before the first dash. */
function fakeModels(current: string | undefined, roles: Record<string, string> = {}) {
	const parse = (spec: string): FakeModel | undefined => {
		const target = spec.startsWith("@") ? roles[spec.slice(1)] : spec;
		if (!target || !target.includes("/")) return undefined;
		const [provider, id] = target.split("/") as [string, string];
		return { provider, id };
	};
	return {
		resolve: (spec: string) => parse(spec) as never,
		current: () => (current ? parse(current) : undefined) as never,
		family: (model: FakeModel) => model.id.split("-")[0]!,
	};
}

const CHAIN = ["@pr-review", "rg_ai/gpt-6.1-sol:high", "anthropic/claude-opus-5-5:high", "zai/glm-5.3:max"];

describe("routeReviewerChain", () => {
	test("moves models of a different family than the session model ahead of same-family ones", () => {
		const chain = ["anthropic/claude-opus-5-5:high", "rg_ai/gpt-6.1-sol:high", "anthropic/claude-sonnet-5-5:high", "zai/glm-5.3:max"];
		const routed = routeReviewerChain(chain, fakeModels("anthropic/claude-opus-5-5"), { disabledProviders: [], invert: true });
		expect(routed).toEqual(["rg_ai/gpt-6.1-sol:high", "zai/glm-5.3:max", "anthropic/claude-opus-5-5:high", "anthropic/claude-sonnet-5-5:high"]);
	});

	test("an unset role alias is demoted behind resolvable cross-family models", () => {
		const routed = routeReviewerChain(CHAIN, fakeModels("rg_ai/gpt-6.1-sol"), { disabledProviders: [], invert: true });
		expect(routed).toEqual(["anthropic/claude-opus-5-5:high", "zai/glm-5.3:max", "@pr-review", "rg_ai/gpt-6.1-sol:high"]);
	});

	test("a configured leading role is the user's choice and keeps its position even when same-family", () => {
		const models = fakeModels("anthropic/claude-opus-5-5", { "pr-review": "anthropic/claude-sonnet-5-5" });
		expect(routeReviewerChain(CHAIN, models, { disabledProviders: [], invert: true })).toEqual(CHAIN);
	});

	test("inversion off or no session model leaves the order alone", () => {
		expect(routeReviewerChain(CHAIN, fakeModels("rg_ai/gpt-6.1-sol"), { disabledProviders: [], invert: false })).toEqual(CHAIN);
		expect(routeReviewerChain(CHAIN, fakeModels(undefined), { disabledProviders: [], invert: true })).toEqual(CHAIN);
	});

	test("drops disabled providers before reordering, and returns empty when all are disabled", () => {
		const routed = routeReviewerChain(CHAIN, fakeModels("anthropic/claude-opus-5-5"), { disabledProviders: ["rg_ai"], invert: true });
		expect(routed).toEqual(["zai/glm-5.3:max", "@pr-review", "anthropic/claude-opus-5-5:high"]);
		const none = routeReviewerChain(["rg_ai/gpt-6.1-sol:high"], fakeModels(undefined), { disabledProviders: ["rg_ai"], invert: true });
		expect(none).toEqual([]);
	});
});
