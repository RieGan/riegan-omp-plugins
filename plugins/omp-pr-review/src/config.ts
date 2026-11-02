import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";

export const PLUGIN_NAME = "omp-pr-review";

export interface ReviewConfig {
	disabledProviders: string[];
	modelInversion: boolean;
}

/** Defaults mirror `package.json#omp.settings`; the lockfile only stores values the user set. */
const DEFAULTS: ReviewConfig = { disabledProviders: [], modelInversion: true };

export function parseConfig(raw: Record<string, unknown>): ReviewConfig {
	const providers = typeof raw.disabledProviders === "string" ? raw.disabledProviders : "";
	return {
		disabledProviders: providers
			.split(",")
			.map(p => p.trim())
			.filter(Boolean),
		modelInversion: typeof raw.modelInversion === "boolean" ? raw.modelInversion : DEFAULTS.modelInversion,
	};
}

export async function loadConfig(cwd: string): Promise<ReviewConfig> {
	try {
		return parseConfig(await getPluginSettings(PLUGIN_NAME, cwd));
	} catch {
		return { ...DEFAULTS, disabledProviders: [] };
	}
}
