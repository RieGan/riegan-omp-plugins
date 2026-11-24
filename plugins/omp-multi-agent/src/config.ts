import { getPluginSettings } from "@oh-my-pi/pi-coding-agent/extensibility/plugins/loader";
import { DEFAULT_PLANNER_MODELS } from "./models";

export const PLUGIN_NAME = "omp-multi-agent";

export interface TeamConfig {
	disabledProviders: string[];
	reviewPolicy: "risk-based" | "always";
	commitPolicy: "per-task" | "none";
	maxStalledNudges: number;
	ultraworkKeyword: boolean;
	plannerSwitchModel: boolean;
	/** Planner chain in attempt order; the `plannerModels` setting replaces the built-in default when set. */
	plannerModels: string[];
}

/** Defaults mirror `package.json#omp.settings`; the lockfile only stores values the user set. */
const DEFAULTS: TeamConfig = {
	disabledProviders: [],
	reviewPolicy: "risk-based",
	commitPolicy: "per-task",
	maxStalledNudges: 3,
	ultraworkKeyword: true,
	plannerSwitchModel: true,
	plannerModels: DEFAULT_PLANNER_MODELS,
};

function splitList(value: unknown): string[] {
	return typeof value === "string"
		? value
				.split(",")
				.map(entry => entry.trim())
				.filter(Boolean)
		: [];
}

export function parseConfig(raw: Record<string, unknown>): TeamConfig {
	const plannerModels = splitList(raw.plannerModels);
	const stalls = Number(raw.maxStalledNudges);
	return {
		disabledProviders: splitList(raw.disabledProviders),
		reviewPolicy: raw.reviewPolicy === "always" ? "always" : DEFAULTS.reviewPolicy,
		commitPolicy: raw.commitPolicy === "none" ? "none" : DEFAULTS.commitPolicy,
		maxStalledNudges: Number.isFinite(stalls) && stalls >= 1 ? Math.floor(stalls) : DEFAULTS.maxStalledNudges,
		ultraworkKeyword: typeof raw.ultraworkKeyword === "boolean" ? raw.ultraworkKeyword : DEFAULTS.ultraworkKeyword,
		plannerSwitchModel:
			typeof raw.plannerSwitchModel === "boolean" ? raw.plannerSwitchModel : DEFAULTS.plannerSwitchModel,
		plannerModels: plannerModels.length > 0 ? plannerModels : DEFAULTS.plannerModels,
	};
}

export async function loadConfig(cwd: string): Promise<TeamConfig> {
	try {
		return parseConfig(await getPluginSettings(PLUGIN_NAME, cwd));
	} catch {
		return { ...DEFAULTS };
	}
}
