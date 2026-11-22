# Hollowgate Aruba production package

This directory is a preparation source, not an authorization to deploy.

For **future API + VTT core-only updates**, see
[`CORE-RELEASE-RUNBOOK.md`](CORE-RELEASE-RUNBOOK.md). Its release script has
not been installed or run in production; it does not cover email/OAuth rollout.

For the **not-yet-approved email + Google/Discord rollout**, see
[`PUBLIC-AUTH-RELEASE.md`](PUBLIC-AUTH-RELEASE.md). Its overlays and read-only
schema/Caddy preparation do not activate any public feature.
The new-social-user staging acceptance checklist is
[`STAGING-NEW-SOCIAL-QA.md`](STAGING-NEW-SOCIAL-QA.md).

## Safety gates

1. Rotate the historical Supabase keys before cutover.
2. Take and restore-test a PostgreSQL backup.
3. Create the `hollowgate_auth_app` LOGIN role with membership in
   `hollowgate_api_runtime`; never connect the API as an owner or superuser.
4. Copy `production.env.example` to `config/production.env` and review every
   feature flag. Do not place credentials in that file.
5. Create mode-0600 secret files under `secrets/`: `postgres_password`,
   `auth_hmac_key` (at least 32 random bytes), and `resend_api_key`.
6. Keep signup, password reset, signaling, game sessions and TURN disabled
   until their external dependencies have been independently verified.
7. Run the database migration and `verify-migration.mjs`; it must report
   339/339 source records and zero validation failures.
8. Start the API on loopback and verify `/health`, `/ready`, login, bootstrap,
   campaign reads, an asset download and a write/read-after-restart cycle.
9. Install the Caddy site only in the approved cutover window. DNS and the old
   public site remain untouched until explicit authorization.

The release archive intentionally excludes local credentials, `.env` files,
certificates, node_modules, QA screenshots and legacy scripts containing
Supabase access keys.
