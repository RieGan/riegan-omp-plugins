# Security — Python

## Flag
- `cursor.execute(f"...{x}")`, `"..." % x`, `.format()`, `+` into SQL; SQLAlchemy `text(f"...")`/`execute(f"...")`; Django `.raw()`, `.extra()`, `RawSQL`, `cursor.execute` with interpolated string; `Model.objects.filter(**request.GET.dict())` / `**request.data` (lookup injection: `password__startswith`, relation traversal leaks). `execute(sql, params)` with a params tuple/dict is safe; identifiers still need an allowlist.
- `subprocess.*(..., shell=True)` or `os.system/popen` with tainted text; list-form argv with a tainted leading `-` arg and no `--`; `shlex.quote` omitted on any shell string.
- `pickle.load(s)`, `cPickle`, `marshal`, `shelve`, `dill`, `jsonpickle.decode`, `yaml.load(x)` without `SafeLoader` (PyYAML 6 requires an explicit `Loader`; `Loader=yaml.Loader/UnsafeLoader/FullLoader` on untrusted data is unsafe), `torch.load(..., weights_only=False)` (default is `True` since torch 2.6), `numpy.load(allow_pickle=True)`, `pandas.read_pickle`. Source must be untrusted (network, user upload, shared cache/queue, downloaded model).
- `eval`, `exec`, `compile`, `__import__(tainted)`, `importlib.import_module(tainted)`, `getattr(module, tainted)()` dispatch, `render_template_string(user)`, `jinja2.Template(user)`/non-sandboxed `Environment` on user templates (SSTI). `ast.literal_eval` is safe.
- Path traversal: `os.path.join(base, user)` — an absolute `user` discards `base`, `..` escapes; require `resolve()` + `is_relative_to(base)` (3.9+) or `werkzeug.utils.secure_filename`/`send_from_directory`. `tarfile.extractall` / `extract` on untrusted archives: Python 3.12+ has `filter=`; 3.12/3.13 default is legacy (unsafe), 3.14 defaults to `'data'`. Flag extraction without `filter='data'` if the project supports < 3.14 and the archive is untrusted. `zipfile.extractall` sanitizes names but not symlink-style tricks from other libs.
- XSS: `mark_safe`, `|safe`, `{% autoescape off %}`, `Markup(user)`, `format_html` misuse (f-string before it), Jinja `Environment()` built directly without `autoescape=True` (Flask's app env autoescapes `.html`; plain `Environment` does not), returning `HttpResponse(user_html)`.
- CSRF: Django `@csrf_exempt` on a cookie-authenticated mutating view, `CsrfViewMiddleware` removed; Flask forms/APIs on session cookies with no CSRF layer where repo uses Flask-WTF/CSRFProtect.
- Authn/authz in frameworks: DRF view without `permission_classes` when `DEFAULT_PERMISSION_CLASSES` is unset/`AllowAny`; `get_object`/`Model.objects.get(pk=pk)` without `.filter(owner=request.user)` or `check_object_permissions`; FastAPI route lacking `Depends(auth)` that sibling routes carry, `APIRouter` included without `dependencies=[...]` the repo applies elsewhere; `assert user.is_admin` (stripped under `python -O`); `if request.user.is_authenticated` without a permission check; `@login_required` missing on new Django view. Serializer/pydantic model with privileged fields (`is_staff`, `role`, `owner`) writable by the client (`fields = "__all__"`, `ModelForm` without `fields`).
- JWT (PyJWT/python-jose): `jwt.decode(..., options={"verify_signature": False})`, missing `algorithms=[...]`, `verify=False`, no `aud` check where repo uses it.
- `random.*` or `uuid.uuid1` for tokens/OTP/passwords/reset links — use `secrets`/`uuid4`. `==` on HMAC/tokens where `hmac.compare_digest` is used elsewhere. `hashlib.md5/sha1` or unsalted `sha256` for passwords (use Django hashers/`argon2`/`bcrypt`); AES-ECB; constant IV.
- `requests.*(verify=False)`/`ssl._create_unverified_context()`/`CERT_NONE` outside tests; `requests.get(user_url)` with attacker-chosen host (redirects follow by default; no allowlist).
- XML: `lxml` `XMLParser(resolve_entities=True / no_network=False)` or `etree.fromstring` on untrusted XML with DTD loading; `xml.sax`/`minidom`/`ElementTree` do not fetch external entities in current Python (billion-laughs is DoS, excluded) — recommend `defusedxml` only for lxml/expat configs that enable entities.
- Config: Flask `app.run(debug=True)` / `DEBUG = True` reachable in a production settings module, Werkzeug debugger exposed; hardcoded `SECRET_KEY`/`SECRET_KEY = "changeme"` in non-dev settings; Django `ALLOWED_HOSTS = ["*"]` with host-based password reset links; `SESSION_COOKIE_SECURE=False` set explicitly in prod settings; `CORS_ALLOW_ALL_ORIGINS=True` with `CORS_ALLOW_CREDENTIALS=True`.
- Logging: `logger.info(f"... {request.headers}")`, `logging.debug(payload)` with tokens/passwords, `repr(settings)`; tracebacks returned in JSON responses.
- `tempfile.mktemp` (race) feeding writes of sensitive data; `os.chmod(path, 0o777)` on secrets.
- Dependencies: `requirements*.txt`/`pyproject.toml` with new `git+https` URL, `--index-url`/`--extra-index-url` added (dependency confusion), `--trusted-host`, new package one edit from a popular name; `setup.py` executing downloads.
- LLM glue: model output passed to `eval/exec/subprocess/cursor.execute`, tools with filesystem/shell access fed by untrusted documents.

## Safe (do not flag)
- Django ORM `filter(field=value)`, `get_object_or_404(Model, pk=pk, owner=user)`; template auto-escaping (`{{ x }}`); `format_html` with args; CSRF middleware default-on.
- `yaml.safe_load`, `json.loads`, `ast.literal_eval`, `subprocess.run([...])` list form, `shlex.split` of constants.
- SQLAlchemy Core/ORM expressions, `text("... :p")` with `bindparams`/dict params; psycopg `%s` with params (not `%` formatting).
- `secrets`, `os.urandom`, `uuid.uuid4()`; `random` for sampling/jitter/test data.
- Pydantic/FastAPI `response_model` filtering out fields; FastAPI path/body validation by type hints.
- Fixed, developer-authored Jinja templates; env vars and CLI args as trusted; settings read from `os.environ`.
- `pickle` of data the same service wrote to a private cache/file with no cross-trust writer (note only if the cache is shared/multi-tenant).
- Tests, `conftest.py`, notebooks, scripts under `examples/`/`docs/` without a concrete untrusted-input path.
- Stdlib `xml.etree`/`xml.dom` entity-expansion DoS; `re` ReDoS; `requests` missing `timeout` (performance).
