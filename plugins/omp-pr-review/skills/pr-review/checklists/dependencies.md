# Dependencies checklist

Load when: manifests or lockfiles change — `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, `go.mod`/`go.sum`, `Cargo.toml`/`Cargo.lock`, `pyproject.toml`, `requirements*.txt`, `poetry.lock`, `uv.lock`, `Gemfile*`, `pom.xml`, `build.gradle*`, `Dockerfile` base images, CI action refs. Lockfile hunks live in `deps.patch` (path in context.md), not `diff.patch`; read them here (overrides the protocol's lockfile skip) only to compare against the manifest.

## Flag
- New dependency duplicating an existing one or stdlib/platform capability — name the existing dep/API that already does it (e.g. second HTTP client, date lib, `lodash.get` vs `?.`, `uuid` vs `crypto.randomUUID()`).
- Maintenance/popularity sanity — new direct dep that is archived/deprecated (registry deprecation notice, README banner), last release years old, or single-maintainer with trivial scope. Report only with a fact you read (registry metadata, repo), not a guess.
- License incompatibility — new dep's license is GPL/AGPL/SSPL/BUSL (or none/unknown) in a proprietary or permissive-licensed project; quote the license field and the project's license. LGPL dynamic linking is not a hit.
- Install-time code execution — new dep or version adds `preinstall`/`install`/`postinstall`, `build.rs` fetching network, `setup.py` side effects, or a `curl | sh` in CI; quote the script.
- Typosquat-looking name — new package one edit from a popular one (`reqeusts`, `colorsss`, `@types-` impostors), brand-new publisher, or scope that differs from the well-known package. Report as security with `uncertain:` if registry data unavailable.
- Pin policy violation — repo pins exact versions (or uses `==`/lock-only) and the new entry uses `^`/`*`/`latest`/git branch/unpinned image tag, or the reverse; also CI actions not SHA-pinned where all other actions are.
- Major bump with breaking changes unhandled — `x` → `x+1` and the diff keeps calling a removed/changed API (verify in the changelog or types), or the engine/peer range now excludes the repo's supported runtime.
- Manifest/lockfile out of sync — manifest dep added/changed/removed with no matching lockfile change (or the lockfile references a version the manifest range excludes); `go.mod` without `go.sum` entries.
- Unrelated lockfile churn — large transitive upgrades, registry URL changes (`resolved` pointing to a non-default registry or a git/tarball URL), or integrity hashes dropped, with no manifest reason.
- Wrong dependency section — runtime-imported package under `devDependencies`, or test/build-only package under `dependencies`, confirmed by import sites.
- Frontend bundle impact — whole-library import in client code (`import _ from "lodash"`, moment with locales, full icon pack) where a sub-path/lighter equivalent exists; name the size cost only if known.
- Vulnerable pin — new/changed version matching a known advisory you can cite (GHSA/CVE id); otherwise skip.

## Do not flag
- Routine patch/minor bumps from Dependabot/Renovate with a green lock update.
- Lockfile-only diffs that match a manifest change and nothing else.
- Dev-only tooling choices (linters, test runners, formatters) on taste.
- A dependency being "large" or "popular enough" without a concrete fact.
- Transitive dependency details, or the dep's internal code quality.
- Version spec style when the repo has no stated convention.
- Licenses compatible with the project (MIT/BSD/Apache-2.0/ISC/MPL file-level) .

## Severity
- Critical: typosquat/malicious-looking package or install script exfiltrating; AGPL/GPL dep linked into a proprietary shipped product; build or install broken by a lockfile/manifest mismatch.
- Important: major bump with unhandled breaking API; unpinned/`latest` tag in a repo that pins; runtime dep in `devDependencies`; dep with a cited high-severity advisory.
- Minor: duplicate of an existing capability, unrelated lockfile churn, whole-library client import, stale or unmaintained small dep.
