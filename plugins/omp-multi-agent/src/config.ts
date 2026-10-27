import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";

export const PLUGIN_NAME = "omp-multi-agent";

export interface TeamConfig {
	disabledProviders: string[];
	reviewPolicy: "risk-based" | "always";
	commitPolicy: "per-task" | "none";
	maxStalledNudges: number;
	ultraworkKeyword: boolean;
	plannerSwitchModel: boolean;
}

/** Defaults mirror `package.json#omp.settings`; the lockfile only stores values the user set. */
const DEFAULTS: TeamConfig = {
	disabledProviders: [],
	reviewPolicy: "risk-based",
	commitPolicy: "per-task",
	maxStalledNudges: 3,
	ultraworkKeyword: true,
	plannerSwitchModel: true,
};

export function parseConfig(raw: Record<string, unknown>): TeamConfig {
	const providers = typeof raw.disabledProviders === "string" ? raw.disabledProviders : "";
	const stalls = Number(raw.maxStalledNudges);
	return {
		disabledProviders: providers
			.split(",")
			.map(p => p.trim())
			.filter(Boolean),
		reviewPolicy: raw.reviewPolicy === "always" ? "always" : DEFAULTS.reviewPolicy,
		commitPolicy: raw.commitPolicy === "none" ? "none" : DEFAULTS.commitPolicy,
		maxStalledNudges: Number.isFinite(stalls) && stalls >= 1 ? Math.floor(stalls) : DEFAULTS.maxStalledNudges,
		ultraworkKeyword: typeof raw.ultraworkKeyword === "boolean" ? raw.ultraworkKeyword : DEFAULTS.ultraworkKeyword,
		plannerSwitchModel:
			typeof raw.plannerSwitchModel === "boolean" ? raw.plannerSwitchModel : DEFAULTS.plannerSwitchModel,
	};
}

export async function loadConfig(cwd: string): Promise<TeamConfig> {
	try {
		return parseConfig(await getPluginSettings(PLUGIN_NAME, cwd));
	} catch {
		return { ...DEFAULTS };
	}
}
