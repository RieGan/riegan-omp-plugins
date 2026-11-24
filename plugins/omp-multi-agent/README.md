# omp-multi-agent

A multi-agent team for [oh-my-pi](https://github.com/can1357/oh-my-pi) (omp ≥ 18.13). Each role runs on its own model, across providers. Planning follows [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent): an interview-driven planner, a gap-analysis critic, and a conductor that runs parallel waves. Execution follows [superpowers](https://github.com/obra/superpowers): workers report a status, every task passes a review gate, the fix loop escalates to stronger models, and every claim needs evidence.

```mermaid
flowchart LR
  U[you] -->|/team-plan| P[Planner<br/>main session]
  P -->|explore / librarian| P
  P -->|plan .omp/team/plans/slug.md| M[plan-analyst gap analysis]
  M -->|high accuracy| MO[plan-reviewer OKAY/REJECT]
  U -->|/team-execute| C[Conductor<br/>main session]
  C -->|wave batch| W[quick · deep · ultrabrain · visual · writing]
  W -->|STATUS report| C
  C -->|risk-based gate| R[task-reviewer]
  R -->|NEEDS_FIXES| W
  C -->|verify · commit · tick| C
  C -->|F1/F2| R
```

## Install

This plugin ships in the `riegan-omp-plugins` marketplace (the repository root). See the [root README](../../README.md) for adding the marketplace, including private-repo access. Then:

```sh
omp plugin install omp-multi-agent@riegan-omp-plugins
```

From a local checkout, link the plugin directory:

```sh
omp plugin link plugins/omp-multi-agent
```

For a single session without installing: `omp -e plugins/omp-multi-agent`.

## Usage

| Command | What it does |
|---|---|
| `/team-plan [request]` | Turns on planner mode and switches the main session to the planner model. The planner explores, interviews you with `ask`, keeps a draft in `.omp/team/drafts/`, writes the plan to `.omp/team/plans/<slug>.md`, and runs `plan-analyst` on it (plus `plan-reviewer` if you ask for high accuracy). It can only write under `.omp/team/`. |
| `/team-execute [slug]` | Restores your model and turns on conductor mode. The conductor runs the plan wave by wave: it delegates each task to its category agent, verifies the result, sends it to review, commits it, and ticks its checkbox. It keeps going until every checkbox is ticked. |
| `/team-status` | Shows the current mode and per-plan progress. |
| `/team-stop` | Leaves planner/conductor mode and stops continuation. |
| `/team-models` | Shows the model each agent resolves to, with its fallbacks. Chains replaced by `task.agentModelOverrides` or `plannerModels` are tagged with their source. |
| `ultrawork` / `ulw` in a prompt | Adds the ultrawork orchestration prompt for that run: explore → todo → delegate by category → verify → don't stop. |

Execution state is kept in `.omp/team/`: `plans/`, `drafts/`, `notepads/<slug>/` (learnings, decisions, issues), and `boulder.json` (the active plan). After a restart, run `/team-execute` to resume; tasks that are already ticked are skipped.

### Continuation

While a plan is executing, the plugin checks the plan whenever the main agent stops. If any `- [ ] N.` / `- [ ] F#.` rows are still unticked, it sends the agent a nudge to continue. It stays quiet in these cases:
- you interrupted (Esc);
- the agent replied `TEAM_WAITING` because it is waiting on your answer;
- `maxStalledNudges` nudges in a row produced no newly ticked task.

## Roster and default models

| Agent | Role | Default chain (first available wins; later ones are retry fallbacks) |
|---|---|---|
| planner (main) | interview + plan | `@team-planner` → opus-5-5:medium → glm-5.3:max → gpt-6.1-sol:high |
| `explore` | codebase search | `@team-explore` → haiku-5-5:low → glm-5.3-flash:low → gpt-6-luna:low |
| `librarian` | external docs / OSS | `@team-librarian` → glm-5.3-flash:low → gpt-6-luna:low |
| `consultant` | read-only consultant | `@team-consultant` → gpt-6.1-sol:xhigh → glm-5.3:max → opus-5-5:high |
| `plan-analyst` | plan gap analysis | `@team-critic` → gpt-6.1-sol:medium → glm-5.3:high → opus-5-5:medium |
| `plan-reviewer` | strict plan review | `@team-critic` → gpt-6-astra:high → glm-5.3:max → opus-5-5:medium |
| `quick` | small, specified changes | `@team-quick` → glm-5.3-flash:high → haiku-5-5:high → gpt-6-luna:high |
| `deep` | standard implementation | `@team-deep` → sonnet-5-5:high → gpt-6-astra:high → glm-5.3:max |
| `ultrabrain` | hard logic | `@team-ultrabrain` → gpt-6-astra:high → gpt-6.1-sol:xhigh → glm-5.3:max → opus-5-5:medium |
| `visual` | UI/UX | `@team-visual` → opus-5-5:medium → gpt-6-astra:medium → glm-5.3:max |
| `writing` | docs/prose | `@team-writing` → sonnet-5-5:medium → glm-5.3:high |
| `task-reviewer` | per-task + final review | `@team-reviewer` → gpt-6.1-sol:high |

The defaults live in the `model:` frontmatter of `agents/*.md` (planner: `DEFAULT_PLANNER_MODELS` in `src/models.ts`) and reference the providers `anthropic`, `rg_ai`, and `zai`.

Implementers autoload the bundled skills: `team-worker-protocol` (scope rules + `STATUS:` report), `team-test-driven-development`, `team-verification-before-completion`, and `team-systematic-debugging` (ultrabrain, consultant).

## Overriding models

You can change models through config without editing any plugin file. Choose a method by how much of a chain you want to replace:

| Method | Scope | Effect |
|---|---|---|
| `modelRoles.team-<role>` | any agent, including the planner | Tried first; the default chain remains as retry fallbacks. |
| `task.agentModelOverrides.<agent>` | subagents only | Replaces the agent's whole chain; its frontmatter `model:` is ignored. |
| `plannerModels` plugin setting | planner only | Replaces the planner's whole chain. |

### 1. Change only the first choice: `modelRoles`

Set it in `~/.omp/agent/config.yml`, or interactively with `/model` → Roles:

```yaml
modelRoles:
  team-deep: rg_ai/gpt-6-astra:high
  team-consultant: anthropic/claude-opus-5-5:xhigh
  team-critic: rg_ai/gpt-6.1-sol:high      # shared by plan-analyst and plan-reviewer
  team-planner: anthropic/claude-opus-5-5:max
```

Roles: `team-planner`, `team-explore`, `team-librarian`, `team-consultant`, `team-critic`, `team-quick`, `team-deep`, `team-ultrabrain`, `team-visual`, `team-writing`, `team-reviewer`. An unset role is skipped.

### 2. Replace a subagent's whole chain: `task.agentModelOverrides`

Also in `~/.omp/agent/config.yml`. The key is the agent name:

```yaml
task:
  agentModelOverrides:
    deep: ["zai/glm-5.3:max", "anthropic/claude-sonnet-5-5:high"]
    plan-reviewer: rg_ai/gpt-6.1-sol:high
```

An empty entry is ignored. This has no effect on the planner, because the planner runs in the main session.

### 3. Replace the planner's whole chain: `plannerModels`

Globally:

```sh
omp plugin config set omp-multi-agent plannerModels "@team-planner, zai/glm-5.3:max, anthropic/claude-opus-5-5:xhigh"
```

For one project, in `.omp/plugin-overrides.json`:

```json
{ "settings": { "omp-multi-agent": { "plannerModels": "zai/glm-5.3:max, rg_ai/gpt-6.1-sol:high" } } }
```

Leave it empty to use the built-in chain.

### Rules for all three

- A `:level` suffix sets thinking effort: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, or `auto`.
- In a chain, the first available model is used, and the rest are retry fallbacks.
- `disabledProviders` still removes models from those providers, overrides included.
- `/team-models` shows the model each agent will use. A replaced chain is tagged `[task.agentModelOverrides]` or `[plannerModels setting]`.

## Settings

Set these with `omp plugin config` (global) or `.omp/plugin-overrides.json` → `settings["omp-multi-agent"]` (per project):

| Key | Default | Meaning |
|---|---|---|
| `disabledProviders` | `""` | Comma-separated providers the team never routes to (e.g. `synthetic`). Matching entries are dropped from every team agent's chain at spawn time, and from the planner's. |
| `reviewPolicy` | `risk-based` | `risk-based`: tasks marked `Review: skip` (quick, no shared contract) skip the per-task reviewer. `always`: every task is reviewed. |
| `commitPolicy` | `per-task` | `per-task`: the conductor commits each verified task's files. `none`: nothing is committed. |
| `maxStalledNudges` | `3` | How many continuation nudges in a row without progress before giving up. |
| `ultraworkKeyword` | `true` | Turns the `ultrawork`/`ulw` keyword on or off. |
| `plannerSwitchModel` | `true` | Whether `/team-plan` switches the main model (and restores it afterwards). |
| `plannerModels` | `""` | Comma-separated planner chain, e.g. `@team-planner, zai/glm-5.3:max`. When set, it replaces the built-in chain; leave it empty to use the default. |

## Notes

- Any extension with a `tool_call` handler turns off omp's speculative task launch. This plugin needs that handler for the planner write guard.
- Subagents never commit, edit the plan, or spawn implementers. They can only spawn read-only `explore`/`librarian` (and `consultant` for `ultrabrain`).
- 0.2.0 renamed three agents: `oracle` → `consultant`, `metis` → `plan-analyst`, `momus` → `plan-reviewer`. The `team-oracle` role is now `team-consultant`. If your `modelRoles` or `task.agentModelOverrides` use the old names, rename those keys.
- Development happens from the repository root: `bun install`, `bun test`, `bun run typecheck`.
