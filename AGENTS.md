# Agent instructions: IndoThai Strapi

## Project scope

- This repository is the Strapi 5 backend for the IndoThai website. Keep changes
  limited to the requested backend work; do not change the Astro frontend from
  this checkout.
- Read `README.md`, `package.json`, and the affected schemas/configuration before
  editing. Treat the existing implementation as the source of truth when these
  instructions do not cover a detail.
- Recheck `git status` before editing and preserve unrelated changes. Do not
  modify, remove, or commit files that are outside the requested scope.
- Use npm and preserve `package-lock.json`. Do not add or upgrade dependencies
  without a concrete requirement and owner approval.

## Security and data handling

- Never print, copy, commit, or expose values from `.env`, service-account files,
  database credentials, admin credentials, tokens, signed URLs, or production
  records. Use `.env.example` when documenting configuration names.
- Do not read, alter, seed, upload, migrate, publish, or delete live data without
  separate owner approval. Tests must use mocks or synthetic local fixtures by
  default.
- Do not weaken authentication, validation, CORS, upload restrictions, content
  security policy, bucket IAM, or Users & Permissions access to make a request
  pass. Public permissions must remain narrowly scoped to the intended actions.
- Do not expose private media through public URLs. Signed private-media URLs are
  temporary bearer links and must never be logged or returned by public APIs.
- Preserve Create-only public access for Candidate, Complaint, Contact Form,
  Close Account Request, and Private Upload where configured. Candidate and
  Complaint reads, updates, and deletes must remain private. Normal Upload API
  public actions must remain disabled.

## Public and private media

- The local `@indothai/private-media` provider owns the two-bucket boundary.
  Normal Media Library uploads use `GCS_BUCKET_NAME`; only
  `POST /api/private-upload` uses `GCS_PRIVATE_BUCKET_NAME`.
- Keep the private upload response minimal: `[{ "id": <number> }]`. Do not return
  object names, bucket details, provider metadata, or signed URLs.
- Accept exactly one non-empty multipart `files` value and a supported `purpose`:
  `resume` is PDF-only up to 2,000,000 bytes; `complaint` uses the documented
  allowlist up to 5,000,000 bytes.
- Browser checks are not a security boundary. Keep server-side size, extension,
  MIME, provider, visibility, purpose, and unused-file validation intact.
- Keep upload routing in `src/api/private-upload/` and provider behavior in
  `providers/private-media/`. Avoid introducing a generic upload abstraction.
- Never automatically delete unattached private uploads or replaced public media
  unless the owner explicitly approves a cleanup operation with exact targets.

## Content types and API contracts

- Preserve Strapi-generated `controllers`, `routes`, and `services` structure and
  keep content contracts explicit in each `schema.json`.
- Do not invent fields, publication overrides, placeholder records, or API
  responses. Coordinate schema changes with the frontend contract before editing.
- Preserve current public read access for published Software, Software Category,
  Opening, Blog, Overview, Shareholder Relation, Shareholder Relation Category,
  Financial Report, Disclosure 2015, and Client Relation content.
- Keep Candidate creation tied to an Open opening and a valid unused private
  resume. Keep Complaint creation tied to a valid unused private complaint file
  when an attachment is provided.
- Changes to `src/index.ts` permission seeding must preserve unrelated role
  permissions and the explicit action allowlist. Check the installed
  `@strapi/plugin-users-permissions` implementation before making claims about
  Strapi defaults because defaults are version-sensitive.

## Migration and seed scripts

- Treat `scripts/private-media-migration.js` as a staged operation: `dry-run`,
  `apply`, then `finalize --confirm-delete-public-copies`. Never run `apply` or
  `finalize` without explicit approval, a current database backup, and verified
  bucket access.
- Finalization is destructive. Resolve and verify exact source and destination
  objects before deletion; do not broaden its scope or bypass verification.
- `scripts/seed_shareholder_relation.js --dry-run` is the default safe check.
  Running the seed against Strapi requires explicit approval and credentials only
  through the process environment. Never place credentials in source, fixtures,
  shell history examples, or committed environment files.
- Preserve idempotent matching, skip-and-log handling for missing source files,
  `original_created_at` semantics, and manual orphan review. Do not delete records
  or earlier media merely because they are absent from migration fixtures.

## Implementation style

- Follow the existing TypeScript style in `src/` and CommonJS style in the local
  provider and JavaScript scripts/tests. Keep types and validation close to the
  contract they protect.
- Prefer Strapi services and database APIs already used by the project. Avoid
  direct database writes unless a migration specifically requires them and the
  behavior is covered by tests.
- Keep logs operational and free of personal data, request bodies, credentials,
  file contents, signed URLs, and sensitive object metadata.
- Update `README.md` when setup, environment variables, commands, API behavior,
  migration procedure, or deployment expectations change.

## Verification and release discipline

- Inspect `package.json` before running commands. For application changes, run:

  ```bash
  npm run typecheck
  npm test
  npm run build
  ```

- Add or update focused tests for permission, validation, provider, controller,
  migration, or seed behavior when those areas change. State clearly which checks
  passed and which live Strapi, database, or GCS behavior was not exercised.
- Do not use a successful build or mocked test suite as proof that production IAM,
  signing, CORS, database relations, or two-bucket delivery works. Those require
  separately approved live verification.
- Do not deploy, change domains, alter production environment variables, run
  production migrations, or approve a release without explicit authorization.
