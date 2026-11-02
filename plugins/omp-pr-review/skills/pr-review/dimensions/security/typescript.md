# Security — TypeScript

## Flag
- `child_process.exec/execSync(`...${x}`)`, `spawn(cmd, {shell: true})`, `Bun.$` with `{ raw: x }` or `sh -c` — shell parses tainted text. Check x's source; also `execFile/spawn(argv[])` where a tainted first arg can start with `-` (argument injection) and no `--`.
- `path.join(base, input)` then `fs.*`/`res.sendFile`/`Bun.file` — `join` does not block `..` or absolute segments. Check for `path.resolve` + `startsWith(base + path.sep)` (or `path.relative` not starting with `..`), `express.static`, or `sendFile(p, {root})` (which does reject traversal). Zip/tar extraction (`adm-zip`, `tar`, `unzipper`) writing `entry.path` without the same check.
- ORM/query-builder escapes fed tainted data: Prisma `$queryRawUnsafe`/`$executeRawUnsafe`, `Prisma.raw`; Sequelize `literal`/`query` with interpolation; Knex `raw(`...${x}`)`, `orderByRaw`, `whereRaw`; TypeORM `query()`/`.where(`a = ${x}`)`; `pg`/`mysql2` `query(`...${x}`)`. Prisma `$queryRaw` as a tagged template is parameterized — safe.
- Mongo/Mongoose filter built from `req.body`/`req.query` without schema validation (`{ email, password: req.body.password }` with `password: {"$ne": null}`) — needs Express JSON/qs object parsing reaching the filter; no `sanitizeFilter`/zod/cast.
- Raw-HTML sinks: `dangerouslySetInnerHTML`, `innerHTML/outerHTML/insertAdjacentHTML`, `document.write`, `v-html`, `{@html}`, `bypassSecurityTrust*`, Markdown render with `html: true`/`rehype-raw` without `rehype-sanitize`. Data must be user-influenced and un-sanitized (DOMPurify or equivalent in the path clears it). `<a href={userUrl}>`/`window.location = x` with scheme not checked for `javascript:`.
- Next.js/RSC: Server Actions and Route Handlers are public HTTP endpoints; verify each re-checks session and ownership inside the action, not only in the page or layout. Auth only in `middleware.ts` matcher with a gap (new route outside `matcher`). Secrets in `NEXT_PUBLIC_*`/`VITE_*`/`PUBLIC_*` env or passed as props to Client Components — ships to browser.
- JWT (`jsonwebtoken`, `jose`): `jwt.decode()` used for an auth decision; `verify` without `algorithms: [...]` pinned; `ignoreExpiration: true`; secret fallback `process.env.JWT_SECRET || 'secret'`. `jose` `decodeJwt` does not verify.
- `Math.random()`, `Date.now()`, `uuid v1`, or `nanoid` custom weak alphabets for tokens/reset codes/session IDs — use `crypto.randomBytes`/`crypto.randomUUID`/`getRandomValues`.
- `a === b` on HMAC/token/API-key when `crypto.timingSafeEqual` is used elsewhere (it throws on unequal lengths — compare hashes or length-check first; an uncaught throw is a 500 not a bypass).
- `fetch/axios/got(userUrl)` with attacker-controlled host and no allowlist/private-IP block; `redirect: 'follow'` default lets a public host bounce to internal addresses.
- `cors({ origin: true })`, `origin: req.headers.origin` or `*` with `credentials: true`; `res.redirect(req.query.next)`/`returnTo` on auth flows without relative-path/allowlist check; `postMessage('*')` carrying tokens, or `message` listener without `event.origin` check that acts on the data.
- `eval`, `new Function`, `vm.runInNewContext` (not a sandbox), `require(userInput)`/dynamic `import(userInput)`, `child_process.fork(userPath)`, `ejs/pug/handlebars.compile(userString)`.
- `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0` set in code outside tests; `createCipheriv` with constant IV/nonce; `createHash('md5'|'sha1')` for passwords; `bcrypt` cost lowered vs repo.
- Logging `req.headers`, `req.body`, `config`, `process.env`, or an axios error object (includes `Authorization` in `error.config`) — secret leakage.
- Express error handler returning `err.stack`/`err.message` to clients in non-dev paths; `app.use(errorHandler)` order issues that skip auth on `next(err)`.
- `package.json`: new `postinstall`/`preinstall`/`prepare` scripts, git/tarball/URL dependency, `overrides`/`resolutions` pointing to forks, name one edit from a popular package, `registry=` changed in `.npmrc`; committed `.npmrc` with `_authToken`.

## Safe (do not flag)
- React/JSX `{value}` interpolation, Vue `{{ }}`, Svelte `{}`, Angular templates: auto-escaped. Setting `textContent`, `setAttribute` on non-URL attributes.
- `Bun.$`\`cmd ${x}\`` and `execFile`/`spawn` with an argv array and no shell: interpolations are escaped/not shell-parsed.
- Parameterized `pg` (`$1`), `mysql2` (`?` + array), Prisma tagged `$queryRaw`, Drizzle `sql` template, Knex bindings (`?`, `??` identifiers).
- `crypto.randomUUID()`, `crypto.getRandomValues`, `crypto.randomBytes` — CSPRNG. `Math.random` for UI keys, jitter, sampling.
- Client-side routes/components lacking auth checks when the API enforces them; tokens in `localStorage` as a design choice (XSS hardening is not a PR finding by itself).
- `JSON.parse` on untrusted input; `Object.assign`/spread merging (prototype pollution needs extreme confidence and a gadget).
- `target="_blank"` without `rel` (modern browsers imply `noopener`); missing `helmet`/CSP headers.
- `process.env.X` and CLI args as trusted values. Secrets read from env/secret manager.
- Test/e2e/storybook/fixture files with fake keys or `rejectUnauthorized: false`.
- Regex built from input (`new RegExp(x)`) — ReDoS/regex injection excluded.
