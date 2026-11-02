# Security — Go

## Flag
- `db.Query/Exec/QueryRow(fmt.Sprintf(...))`, string `+` into a query, `gorm.Raw/Exec/Where(fmt.Sprintf(...))`, `sqlx` `Get/Select` with built strings, `squirrel`/`goqu` `Expr`/`Literal` with tainted text. Placeholders cannot bind identifiers: dynamic `ORDER BY`/column from input needs an allowlist.
- `exec.Command("sh", "-c", s)` / `bash -c` with tainted `s`; `exec.Command(name, args...)` where `name` or a leading arg is tainted, or args can start with `-` (git, curl, tar) without `--`. `exec.Command(tainted)` with no shell is argument/binary choice, not shell injection — name what is controllable.
- `filepath.Join(root, input)` then `os.Open`/`http.ServeFile`/`os.WriteFile` — `Join` calls `Clean` but does not confine; `../x` escapes. Confinement checks: `filepath.IsLocal(input)` (1.20+), `os.OpenRoot`/`os.Root` (1.24+), or `filepath.Clean("/"+input)` then join, or `strings.HasPrefix(abs, root+sep)` (prefix without separator is bypassable: `/data` vs `/data-evil`). Archive extraction (`archive/zip`, `archive/tar`) writing `hdr.Name` without a per-entry check.
- `text/template` (not `html/template`) producing HTML; `template.HTML(x)`, `template.JS`, `template.URL` conversions of tainted data defeat `html/template` escaping. `w.Write([]byte(userHTML))` with `text/html` content type; `Content-Type` sniffing of uploads served inline.
- `math/rand` or `math/rand/v2` (including Go 1.20+ auto-seeding) for tokens, session IDs, passwords, nonces — use `crypto/rand`. `time.Now().UnixNano()` seeds likewise.
- `==`/`bytes.Equal` on MACs/tokens/API keys when `subtle.ConstantTimeCompare`/`hmac.Equal` is the repo norm.
- `tls.Config{InsecureSkipVerify: true}` outside tests; `MinVersion` lowered below TLS 1.2; custom `VerifyPeerCertificate`/`VerifyConnection` that returns nil on error.
- golang-jwt: `jwt.Parse`/`ParseWithClaims` keyfunc that returns the key without checking `token.Method` (alg confusion); `ParseUnverified` used for decisions; no `jwt.WithValidMethods`; `exp` not required where repo requires it.
- Fail-open on error: `if err != nil { log; }` continuing past a failed authz/verify/lookup; `ok, _ := perm.Check(...)` discarding the error then proceeding; `defer`/`recover` that swallows a panic in middleware and serves the request.
- Middleware ordering: handler registered on the mux/router before or outside the group that wraps `authMiddleware` (chi `r.Group`, gin `r.Group().Use`, echo `g.Use` — in gin/echo `Use` applies only to routes registered after it). Go 1.22 `ServeMux` patterns (`GET /items/{id}`): a new pattern may be shadowed or may shadow a protected one.
- Ownership: handler loads by `id := r.PathValue("id")` and acts without `WHERE user_id = $caller`; caller identity taken from a header/body field rather than `ctx` set by auth middleware.
- SSRF: `http.Get(userURL)`/`client.Do` with attacker-chosen host; default client follows up to 10 redirects, so an allowlisted host can bounce to internal addresses unless `CheckRedirect` is set; DNS-rebinding needs a dialer `Control` check — only demand it when the repo already does so.
- Internal errors to clients: `http.Error(w, err.Error(), 500)` exposing SQL/path/secrets; logging `r.Header`, full request dumps (`httputil.DumpRequest`), `fmt.Printf("%+v", cfg)` with secrets.
- `encoding/gob`/`xml` decoding untrusted data into `interface{}`-heavy types is not RCE in Go; flag only third-party unsafe loaders (`yaml.v2` is safe; `go-yaml` anchors only DoS). Do not import Java/Python deserialization instincts.
- `pprof`/`expvar` imported into the public mux (`_ "net/http/pprof"` on `DefaultServeMux` that is served on a public listener) — exposes heap contents.
- `go.mod`: new `replace` to a fork/local path, new dependency with name near a popular module, `GOINSECURE`/`GONOSUMDB`/`GOPRIVATE` widened to bypass checksums; `go:generate` running downloaded code.

## Safe (do not flag)
- `database/sql` with `$1`/`?` placeholders and args; `gorm` `Where("a = ?", x)`, struct/map conditions; `sqlc`-generated queries.
- `exec.Command("git", "log", "--", path)` and other fixed-binary argv calls without a shell.
- `html/template` with plain data (contextual auto-escaping), including inside attributes/JS.
- `http.ServeFile`/`http.FileServer(http.Dir)` reject `..` in the request path (they do not restrict symlinks or resolve a tainted *filename built by you*).
- Memory safety: bounds/nil panics are crashes, not exploits; `unsafe` use is not a security finding unless fed by input.
- Go 1.22 per-iteration loop variables: goroutine capture of `i`/`v` is not a shared-state auth bug.
- `crypto/rand` for tokens; `math/rand` for jitter, shuffling, test data.
- Env vars/flags via `os.Getenv`/`flag` as trusted; `ctx` values set by the repo's auth middleware as trusted identity.
- Panics reaching a global `recover` middleware (availability, not auth bypass); unclosed bodies/leaked goroutines (excluded as resource leaks).
- `_test.go` files and `testdata/`.
