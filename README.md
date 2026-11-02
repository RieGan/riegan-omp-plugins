# riegan-omp-plugins

An [oh-my-pi](https://github.com/can1357/oh-my-pi) plugin marketplace. Each directory under `plugins/` is one plugin.

| Plugin | Description |
|---|---|
| [omp-multi-agent](plugins/omp-multi-agent/README.md) | Planner → critic → conductor team with per-role models across providers. |
| [omp-pr-review](plugins/omp-pr-review/README.md) | High-precision PR/MR review: scope interview, per-dimension specialists, verified findings, GitHub/GitLab posting. |

## Install

```sh
# Private repo: use the SSH URL (your SSH key authenticates the clone).
omp plugin marketplace add git@github.com:RieGan/riegan-omp-plugins.git
# Public repo, or after `gh auth setup-git`: the shorthand works too.
# omp plugin marketplace add RieGan/riegan-omp-plugins

omp plugin install omp-multi-agent@riegan-omp-plugins
```

To update: `omp plugin marketplace update riegan-omp-plugins`, then `omp plugin upgrade omp-multi-agent@riegan-omp-plugins`.

## Layout

```
.omp-plugin/marketplace.json   catalog: one entry per plugin, "source": "./plugins/<name>"
plugins/<name>/                plugin root: package.json (`omp` manifest), src/, agents/, skills/
package.json                   Bun workspace (plugins/*) holding the shared dev dependencies
bunfig.toml                    hoisted linker: node_modules stays at the root, never inside a plugin
tsconfig.json                  type-checks every plugin
```

## Adding a plugin

1. Create `plugins/<name>/package.json` with an `omp` manifest (`extensions`, `settings`, …). List `@oh-my-pi/*` packages under `peerDependencies`; omp provides them at runtime.
2. Add `agents/`, `skills/`, `src/` as needed.
3. Add a catalog entry to `.omp-plugin/marketplace.json`: `{ "name": "<name>", "source": "./plugins/<name>", "version": "0.1.0" }`.
4. Run `bun install`, `bun run typecheck`, `bun test`.

## Releasing

Bump `version` in both `plugins/<name>/package.json` and that plugin's catalog entry, then push. `omp plugin upgrade` only reinstalls when the catalog version is newer.
