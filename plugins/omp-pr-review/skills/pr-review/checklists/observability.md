# Observability checklist

Load when: diff touches logging, metrics, tracing/spans, error handling/`catch`/`recover`/`except`, health checks, alert/dashboard configs, feature flags/kill switches, background jobs, queue consumers, or adds new external calls/failure paths in a service that already instruments similar code.

Calibrate to the repo: compare against how sibling code logs/measures. No sibling instrumentation → no finding.

## Flag
- New failure path with no signal where the repo instruments similar paths — new external call/job/handler whose error branch returns or retries silently while peers log, count, or span; name the peer you compared against.
- Swallowed error hiding an incident — empty `catch {}`, `except: pass`, `_ = err`, `.catch(() => {})`, or error converted to a default value/`null` with no log or metric, on a path where failure changes user-visible or persisted results.
- Log leaks secrets/PII — token, password, auth header, full request/user object in a log line. Report the exposure under data-privacy/security rules; here only note it if not already covered.
- Log-level misuse — real failures logged at `debug`/`info` (lost in prod filters), or expected/high-frequency conditions (cache miss, validation 4xx, retry attempt, per-item loop) logged at `error`/`warn` so they page or flood; show the frequency from the code path.
- Error logged and rethrown at multiple layers — same error logged at each frame, duplicating alerts; only when the diff adds the extra layer.
- Lost error context — log/wrap without the cause or key identifiers (`log("failed")`, `throw new Error("failed")` dropping the original error, no `%w`/`from e`/`cause`), where the original is the only diagnostic.
- High-cardinality metric labels — user id, email, request id, URL with path params, raw error message, or timestamp used as a label/tag/attribute on a counter/histogram; quote the label and show the unbounded source.
- Broken correlation across new async boundaries — new queue publish, background task, worker/thread/goroutine, webhook, or outbound HTTP call that drops the trace/request/correlation id the repo propagates elsewhere (context not passed, headers not injected, `AsyncLocalStorage`/`contextvars` lost).
- Spans/timers never closed — span started without `end()`/`defer`/context manager on an error path; timer or in-flight gauge not decremented on exception.
- Risky rollout without a kill switch — behavior change on a hot or irreversible path (payments, migrations, new external dependency, auth) shipped unguarded while the repo gates comparable changes behind feature flags; also new flag with no default/off state, or flag removal leaving a dead reader.
- Alerts/dashboards broken by rename — metric name, label, log message string, or span name changed/removed while an alert rule, dashboard, SLO, or log-based query in the repo (grep the old name) still references it.
- Health/readiness probe lies — new required dependency not reflected in readiness, or liveness check now depends on an external service (restart storms).
- Retries/timeouts invisible — new retry loop or fallback with no attempt/fallback signal while peers emit one.

## Do not flag
- Absence of logs/metrics/traces when repo siblings have none either, or "add more logging" generically.
- Log message wording, structured-vs-printf style, or field naming that a linter/logger convention does not mandate.
- Intentional swallowing documented by comment (best-effort cleanup, shutdown paths, `ENOENT` on delete).
- Debug/trace logs, test code, scripts, and one-off migrations.
- Cardinality of labels with a bounded, enumerated set (status code class, region, route template).
- Feature-flag absence on small, reversible, low-risk changes.
- Metrics/log changes where no consumer in the repo references the old names (external consumers unseen: mention in `uncertain:` only for Important+).

## Severity
- Critical: error swallowed on a data-writing or payment path so failures silently corrupt/lose data; irreversible or high-blast-radius change with no kill switch where the repo requires one.
- Important: alert/dashboard/SLO broken by a rename; new critical failure path with no log/metric while peers have one; trace context dropped across a new async boundary; unbounded metric label that can exhaust the metrics backend; errors logged at wrong level so they never reach prod logs.
- Minor: lost error cause in a secondary path, duplicate logging across layers, unclosed span on a rare error branch, noisy per-item `warn`.
