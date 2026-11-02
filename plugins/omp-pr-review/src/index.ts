import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "./config";
import { routeReviewerChain } from "./routing";

/** Agents shipped in ./agents whose model chains this plugin routes. */
const REVIEW_AGENTS: Record<string, true> = { "pr-reviewer": true, "pr-verifier": true };

export default function ompPrReview(pi: ExtensionAPI) {
	pi.on("before_subagent_spawn", async (event, ctx) => {
		if (!REVIEW_AGENTS[event.agent]) return;
		const config = await loadConfig(ctx.cwd);
		const routed = routeReviewerChain(event.patterns, ctx.models, {
			disabledProviders: config.disabledProviders,
			invert: config.modelInversion,
		});
		if (routed.length === 0) {
			return {
				block: true,
				reason: `omp-pr-review: every model for "${event.agent}" is on a disabled provider (${config.disabledProviders.join(", ")}). Configure modelRoles.pr-review / pr-verify or adjust disabledProviders.`,
			};
		}
		if (routed.every((pattern, i) => pattern === event.patterns[i]) && routed.length === event.patterns.length) return;
		return { model: routed, note: "pr-review: cross-family / enabled-provider models first" };
	});

	pi.registerCommand("pr-review", {
		description:
			"Review a PR/MR or the working tree. Args: PR number, GitHub/GitLab URL, or nothing; optional --focus <dims>, --quick|--deep, --post.",
		handler: async args => {
			const request = args.trim();
			pi.sendUserMessage(
				`Read skill://pr-review and follow it. Review request: ${request || "(none given — resolve the scope with me)"}`,
			);
		},
	});
}
