# Security — Rust

Safe Rust is memory-safe: report logic-level vulnerabilities (injection, authz, crypto misuse, SSRF, path traversal). `unsafe`/FFI memory bugs belong to correctness unless reachable from attacker input with a traced path.

## Flag
- `sqlx::query(&format!(...))`, `query_as(&format!(..))`, `sqlx::raw_sql` with tainted text; `diesel::sql_query(format!(..))`; `rusqlite` `execute(&format!(..), [])`; `sea_orm` `Statement::from_string` with interpolation; `tokio-postgres` `query(&format!..)`. Safe: `sqlx::query!`/`query_as!` macros, `.bind(x)`, `params![]`, diesel DSL. Dynamic identifiers need an allowlist.
- `Command::new("sh").arg("-c").arg(tainted)` / `cmd /C`; tainted program name; tainted args starting with `-` without `--`. Plain `Command::new("git").arg(x)` has no shell — flag only for argument injection into tools with dangerous flags. On Windows, `.bat`/`.cmd` targets with tainted args are injectable (std escaping hardened in 1.77.2, but still risky on older toolchains).
- Path traversal: `base.join(user)` — an absolute `user` replaces `base`, `..` escapes. Needs `canonicalize()` + `starts_with(base_canon)` (check both sides canonical; `starts_with` on `Path` is component-wise, which is correct), or rejection of non-`Normal` components. `tar::Entry::unpack(path)` with a tainted-derived path is unguarded; `unpack_in` and `Archive::unpack` guard `..`. `zip` crate: use `enclosed_name()`, not `name()`, when joining.
- axum/actix/warp/rocket auth wiring: in axum, `Router::layer`/`route_layer` apply only to routes added before the call — a route added after `.layer(auth)` is unprotected; handler missing the `AuthUser`/`Claims` extractor that siblings take; ownership: `Path(id)` used in a query without `AND owner_id = user.id`; client-controlled `user_id` in body/JSON preferred over extractor identity; `#[derive(Deserialize)]` on a model with privileged fields (`role`, `is_admin`) used directly as input (mass assignment) — `deny_unknown_fields` does not fix it.
- XSS: `Html(format!("...{user}..."))`, `axum::response::Html` with raw string, `maud::PreEscaped`, askama/tera `|safe`/`autoescape off`, or templates with extensions that disable escaping (askama/tera escape by extension `.html/.xml`; `.txt` does not).
- JWT (`jsonwebtoken`): `dangerous_insecure_decode`, `insecure_disable_signature_validation`, `Validation::default()` reused for asymmetric keys (default algorithm HS256), `validate_exp = false`, `validate_aud` left off where repo sets it; algorithm taken from the token header.
- Randomness: `rand::rngs::SmallRng`, `StdRng::seed_from_u64(constant/time)`, `fastrand`, `oorandom` for tokens/keys/nonces. `rand::rng()` (0.9) / `thread_rng()` (0.8) / `OsRng` are CSPRNGs. AEAD nonce reuse (`aes-gcm`/`chacha20poly1305` with constant or counter reset nonce); `==` on `&[u8]` MAC/tokens where `subtle::ConstantTimeEq`/`verify_slice` is used elsewhere; `md5`/`sha1` for password hashing (use `argon2`/`bcrypt`/`scrypt`).
- TLS: `reqwest::ClientBuilder::danger_accept_invalid_certs(true)` / `danger_accept_invalid_hostnames`, `native_tls` equivalents, custom `ServerCertVerifier` accepting all, outside tests.
- SSRF: `reqwest::get(user_url)` / `Client::get(tainted)` with attacker-chosen host and no allowlist; default redirect policy follows 10 redirects — flag only with host/scheme control and no `redirect::Policy` or IP check where the repo has one.
- Fail-open: `.unwrap_or(true)`, `.unwrap_or_default()` on a permission/verify result, `if let Ok(claims) = verify(..) {..}` with no `else` deny that falls through to serving; `let _ = check_permission(..)` discarding a `Result`; `.ok()` swallowing an error from a signature check. A bare `unwrap()` panic is availability (excluded), not bypass, unless a panic hook or catch-unwind turns it into success.
- Deserialization: `serde` into `Box<dyn Trait>` registries via `typetag` from untrusted input selects arbitrary registered types; `bincode`/`rmp` without size limits is DoS (excluded). `serde_yaml`/`serde_json` are not code-exec vectors.
- Logging/secrets: `tracing::info!(?req)`/`{:?}` of structs holding tokens/passwords (`#[derive(Debug)]` on a secret type without `secrecy::Secret`/manual redaction where repo uses them); `.env` or keys in `include_str!`/`include_bytes!` embedded into the binary; error responses with `{:?}` of internal errors.
- `unsafe` reachable from input: `get_unchecked`, `from_raw_parts`, `transmute`, `slice::from_utf8_unchecked` on network data with length/validity derived from input and no check — then it is a Critical memory-safety issue; otherwise leave to correctness.
- Cargo/supply chain: new `build.rs`, proc-macro, or `[build-dependencies]` that downloads/executes; new `git =`/`path =` deps or `[patch]` to forks; registry/`source` replacement in `.cargo/config.toml`; crate name typosquat; `cargo` features enabling `vendored-openssl` removed/added silently to bypass TLS verification.

## Safe (do not flag)
- Buffer overflow/UAF/data-race claims in safe code; `unsafe` blocks with an upheld invariant and no input-derived inputs; integer overflow wrap in release (`debug_assertions` off) without a traced security consequence.
- `sqlx::query!` macros, `.bind()` parameters, diesel query DSL, `rusqlite::params!`.
- `Command::new(literal).args([..])` with fixed or validated args; `std::env::args`/`env::var` as trusted config.
- `OsRng`, `rand::rng()`/`thread_rng()`, `getrandom` for secrets; `SmallRng` for sampling/jitter/tests.
- `rustls` default verification, `reqwest` default TLS; `Path::starts_with` after `canonicalize()` on both sides.
- `maud` templates (auto-escape); askama/tera `.html` templates with default escaping.
- `unwrap`/`expect`/indexing panics on external input (availability; performance/correctness own it).
- Edition 2024 `unsafe extern`, `#[unsafe(no_mangle)]`, `unsafe { env::set_var }` — language-level markers, not vulnerabilities.
- Tests, benches, `examples/`, and `#[cfg(test)]` modules.
