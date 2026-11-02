# API — Python
## Flag
- Public name (no leading underscore, or listed in `__all__`) removed/renamed in a package that is published or imported elsewhere — check `__init__.py` re-exports and `__all__`; removing a name from `__all__` changes `from x import *` and signals the public surface. An in-repo importer not updated is always reportable.
- Signature changes on public callables: new required parameter; parameter removed/renamed (breaks keyword callers); positional parameters reordered; positional-or-keyword → keyword-only (`*`) breaks positional callers; keyword-only → positional is safe; adding `/` makes previously-keyword-passable names positional-only (breaks keyword callers); default value changed; `*args/**kwargs` dropped. Verify via `lsp` references / grep callers, including across `tests/`, docs, scripts.
- Return/raise contract changed: return type shape (list → generator, dict keys, `None` vs raising), new exception type not subclassing the old one, exception base class changed — callers' `except` no longer match.
- Removed/renamed class attribute, method, or base class on a public class; `__init__` signature change on a class users subclass; changed MRO; `@dataclass` field order/defaults change (positional construction breaks), `frozen`/`slots`/`eq` toggles, `NamedTuple` field insertion (breaks unpacking/indexing).
- Pydantic: field renamed without `alias`/`validation_alias` (breaks input and output JSON); `Optional[X]` with no default is still *required* in v2 (v1: implicitly optional) — verify installed major in `pyproject`; type tightened (`str` → `Literal[...]`, `int` → `PositiveInt`); `extra="forbid"` added (old clients sending unknown keys now 422); `model_config`/`Config` changes to `populate_by_name`, `use_enum_values`, `by_alias` dump defaults; `model_dump()` vs `.dict()` output differences; removing a field from a response model used by clients. FastAPI: `response_model` change, path/param rename, `status_code` default, `Depends` param becoming required.
- Django/DRF/Flask routes: URL `path()`/`route` name or converter changed, `name=` used by `reverse()` renamed, serializer field removed/renamed, pagination class default changed, API version namespace changed.
- Click/argparse/typer CLI: option/flag renamed, default changed, argument order, exit codes, output format consumed by scripts; env var prefix (`auto_envvar_prefix`) change; `pyproject` `[project.scripts]`/`entry-points` renamed (breaks installed commands and plugin discovery).
- Packaging metadata: `requires-python` raised, dependency lower bound raised / upper bound added, extras renamed/removed (`pkg[extra]` installs break), package/module directory renamed or `py.typed` removed. Check the project's support policy and CI matrix.
- Persisted formats: `pickle`/`shelve`/`joblib`/cache payloads whose class path, attributes, or `__reduce__`/`__getstate__` changed — old blobs unpickle to broken objects or raise; JSON/YAML config schema key renamed without fallback.
- Celery/RQ/Dramatiq task: name, signature, or serializer changed while old-signature messages are queued — in-flight tasks fail (`TypeError` on missing/extra args). Callers enqueue-time vs worker-time deploy mismatch.
- Alembic/Django migration coupling: model field change without matching migration, or migration importing live models (see `api/sql.md`).
- Behavior changes of public defaults: `timeout=None`, `verify`, encoding, timezone-naive vs aware datetimes, sort stability, `dict` ordering of output.

## Safe (do not flag)
- Underscore-prefixed names, `_internal`/`internal` modules, names not exported from the package `__init__`, test helpers, scripts — when callers are updated.
- Adding optional keyword parameters with unchanged defaults; adding keyword-only params with defaults; widening accepted input types (type hints only).
- Type-hint-only changes with no runtime effect (annotations, `TypeAlias`, `Protocol` additions to internal code), unless the project publishes typed stubs (`py.typed`) and the narrowing breaks typed callers.
- Adding optional fields (with defaults) to pydantic models / dataclasses at the end; adding response fields.
- `from __future__ import annotations` or 3.12+ syntax (`type X = ...`, PEP 695 generics) when `requires-python` already allows it.
- Pre-1.0 packages or applications (not libraries) with no external importers.
- Deprecation via `warnings.warn(DeprecationWarning)` with the old name still working.
