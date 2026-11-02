# API — Go
## Flag
- Exported identifier (capitalized) removed, renamed, or signature changed in a non-`internal/` package of a module at v1+ — report when the module is published/imported by other modules (check `go.mod` module path, other `go.mod`/`go.work` in repo, README) or an in-repo importer is not updated.
- Method added to an exported interface — every external implementer (and in-repo mock/fake) stops compiling. Fix: new smaller interface, or optional-interface type assertion. Check `lsp` implementations.
- Method removed/changed on an exported struct, or receiver switched value ↔ pointer — changes the method set; values previously satisfying an interface no longer do (`T` loses pointer-receiver methods).
- Exported struct changes: field removed/retyped/renamed; adding a field breaks unkeyed literals (`Foo{1, 2}`) and, if the new field is non-comparable (slice, map, func), breaks `==`/map-key use of the struct. Reordering fields breaks unkeyed literals silently when types match.
- Wire tags: `json:"..."`, `yaml`, `db`, `protobuf` struct tag renamed or `omitempty` added/removed on a serialized struct — changes the on-wire/persisted form. Embedded-struct flattening changes also alter JSON.
- Module major version: breaking change on v2+ without `/vN` suffix in `go.mod` `module` line and import paths, or a v2 directory/branch mismatch. At v0/v1 no suffix is correct — do not demand one.
- `go` directive in `go.mod` raised (Go 1.21+ treats it as a hard minimum and may require toolchain download) or `toolchain` line added — breaks consumers/CI on older toolchains; check CI config and stated support policy.
- Behavior changes with same signature: returning a new sentinel/typed error where callers use `errors.Is/As` or `==` on the old one; wrapping (`%w`) added/removed; nil vs empty slice/map returned (JSON `null` vs `[]`); panics newly possible.
- Protobuf/gRPC: field number reused/changed, field type changed, `reserved` dropped, enum zero value changed, RPC renamed, package/service name changed (alters the wire method path). Check `buf.yaml` breaking rules if present.
- HTTP handlers (net/http, gin, chi, echo): route pattern/method changed. Go 1.22 `ServeMux` patterns: `"GET /x"` method-restricted patterns now 405 other methods, and `{id}` wildcards/`{$}` have new matching — a pattern edit can shadow or conflict (panic at registration).
- CLI (`cobra`/`flag`): flag renamed/removed, default changed, shorthand reassigned; `os.Exit` codes changed; env var binding (`viper`) key renamed without alias.
- Type alias/definition swap (`type A = B` ↔ `type A B`) on exported types — alters identity and method set.
- `init()`-time registration order or blank-import side effects changed in a library.

## Safe (do not flag)
- Anything in `internal/`, `cmd/` main packages, `_test.go`, or unexported identifiers; a non-library application module whose packages nobody imports.
- Adding exported functions, types, methods on structs, struct fields to a type constructed only through constructors/keyed literals, new interface in a new type.
- Adding a method to an interface used only inside the module with all implementers (incl. mocks) updated in the diff.
- `v0.x` modules without a stated stability promise.
- Adding a new optional field with `omitempty` to a JSON response struct.
- Go 1.22 loop-variable per-iteration semantics are a language change, not an API break by themselves.
- Regenerated `.pb.go`/mock files whose source `.proto`/interface change was already assessed.
- `go mod tidy` bumping indirect dependency versions.
