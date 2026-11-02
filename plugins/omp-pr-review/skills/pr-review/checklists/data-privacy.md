# Data-privacy checklist

Load when: diff adds/touches fields or identifiers like `email`, `phone`, `ssn`, `address`, `dob`/`birth`, `ip`, `token`, `password`, `name`, geolocation, device id, health/financial data; logs or serializes user/request objects; adds storage, caches, exports, analytics/telemetry/third-party SDK calls, LLM/AI API calls, new DB columns/tables, or retention/deletion logic.

State findings as concrete exposures (what data, to whom/where, how), never as legal conclusions.

## Flag
- PII/secret written to logs, error messages, traces, or crash reports — logging `user`, `req`, `body`, `headers`, `err` wrapping a request, or `%+v`/`JSON.stringify(obj)` of an object that contains the fields above; quote the log call and show the field is populated on that path. Hand secret/token leakage to security if the exploit angle dominates.
- PII sent to a third party — analytics (Segment, Amplitude, GA), error trackers (Sentry breadcrumbs/context), email/SMS vendors, or LLM/AI APIs (prompt includes user content, emails, documents) where the repo does not already do so for that field; name the destination and fields.
- New sensitive column/field stored unprotected — repo encrypts/hashes/tokenizes similar fields (e.g. other PII via an `encrypt()` helper, passwords via bcrypt/argon2) and this field is plaintext; or passwords/tokens stored reversibly.
- Overexposed API response — handler returns the whole ORM/model object or `SELECT *` where the client needs a few fields; the extra fields (email, phone, hash, internal flags, other users' data) reach the caller. Show the serializer path.
- Data minimization — new collection of a field never used downstream in the diff or repo, or a whole object persisted where an id suffices.
- Retention/deletion gap — new table, cache, log sink, backup, or file store of personal data with no TTL/purge and no inclusion in the repo's existing user-deletion/export path (find it; report only if one exists and this data is missing from it).
- Soft-delete or anonymization that leaves PII — `deleted_at` set while email/name remain, or deletion that skips copies (search index, cache, analytics, replicas) the repo already handles for other fields.
- Purpose/consent — data collected for one stated purpose reused for another (marketing, model training, sharing) where a consent flag/setting exists in the repo and is not checked.
- Cross-region/residency — personal data sent to a new region/endpoint only when the repo has explicit residency or region rules; quote them.
- Sensitive data in URLs, query strings, localStorage/cookies without flags, client bundles, or fixtures/seed files containing real-looking personal data.
- Tokens/PII in test snapshots or committed sample data that appear to be real (valid-format SSN, real email domains of customers).

## Do not flag
- Logging of opaque internal ids (user_id, uuid) that the repo already logs.
- Hashing/redaction already applied by a shared logger/serializer (verify the redactor config covers the field).
- Obviously fake data in tests (`test@example.com`, `555-0100`, `John Doe`).
- Email/name used for the feature's core purpose (sending the verification email, rendering the user's own profile to themselves).
- Generic "add encryption", "add a privacy policy", "needs DPA/legal review" with no concrete exposure.
- Pre-existing PII handling the diff does not change.
- Public-by-design data (public profile fields, published authors).
- IP addresses in infrastructure/access logs managed by the platform, unless the diff newly forwards them elsewhere.

## Severity
- Critical: plaintext passwords/tokens/government ids/payment data logged or stored; whole user records exposed to unauthorized callers; PII/secrets sent to an unapproved third party at volume.
- Important: PII in app logs or analytics events on a common path; sensitive column stored unencrypted against repo convention; deletion/export path misses a new personal-data store; overexposed response fields.
- Minor: extra low-sensitivity field returned or collected; missing TTL on a low-risk cache; non-essential PII in debug-level logs.
