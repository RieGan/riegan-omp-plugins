import type { ExtensionModelQuery } from "@oh-my-pi/pi-coding-agent";

type Models = Pick<ExtensionModelQuery, "resolve" | "current" | "family">;

/** Strip a trailing `:level` thinking suffix so the selector resolves. */
function selectorOf(pattern: string): string {
	const idx = pattern.lastIndexOf(":");
	return idx > 0 && /^[a-z]+$/.test(pattern.slice(idx + 1)) ? pattern.slice(0, idx) : pattern;
}

/**
 * Reorder and filter a reviewer's model chain.
 * - Patterns on a disabled provider are removed; unresolvable ones are kept for core to judge.
 * - With `invert`, models from a different family than the session model (the likely author) move ahead
 *   of same-family ones, preserving relative order. A leading `@role` that resolves is the user's explicit
 *   choice and keeps the chain untouched apart from filtering.
 */
export function routeReviewerChain(
	patterns: readonly string[],
	models: Models,
	opts: { disabledProviders: readonly string[]; invert: boolean },
): string[] {
	const entries = patterns.map(pattern => ({ pattern, model: models.resolve(selectorOf(pattern)) }));
	const kept = entries.filter(entry => !entry.model || !opts.disabledProviders.includes(entry.model.provider));
	const current = models.current();
	const pinned = patterns[0]?.startsWith("@") && entries[0]?.model !== undefined;
	if (!opts.invert || !current || pinned) return kept.map(entry => entry.pattern);
	const author = models.family(current);
	const cross = kept.filter(entry => entry.model && models.family(entry.model) !== author);
	const rest = kept.filter(entry => !cross.includes(entry));
	return [...cross, ...rest].map(entry => entry.pattern);
}
