# Hollowgate Aruba: account migration foundation (staging only)

The existing VTT uses Supabase Auth UUIDs, `public.profiles`, and `public.user_roles` (admin/standard). Database objects such as campaigns and character ownership reference user identities. **Preserve UUIDs**, never generate replacement IDs during migration.

## Scope of 001_auth_foundation.sql

- A private `hollowgate_auth` schema, with account UUID, canonical email, display name, origin and account state.
- Role table restricted to `admin` or `standard`. No automatic administrator.
- Password credentials table accepts only Argon2id encoded hashes. It deliberately does not create passwords or import hashes.
- Imported users default to `pending_reset`; enabling their login requires an **email-verified password setup flow** developed and tested later.
- No login, email sending, token issuance or active session machinery exists yet.
- Tests create a disposable PostgreSQL 17 database in CI and check the above safety properties. They do not access live Supabase or Aruba.

## Required design/verification gates before real-user import

1. Inventory the actual Supabase accounts and identity providers, including password-based and OAuth users (read-only), plus profile and role links.
2. Choose an explicit migration strategy for OAuth-linked accounts and existing sessions. Supabase sessions cannot simply be reused with the new API.
3. Build a database app-role with minimum required permissions, instead of connecting production API as the `hollowgate` PostgreSQL superuser from the initial Docker setup.
4. Build and test authenticated registration/login/logout, server-side sessions (hashed tokens), email verification, one-time expiring reset tokens, rate limiting, audit trails, and administrative authorization.
5. Configure a reliable transactional-email provider with SPF/DKIM/DMARC for hollowgate.quest; do not assume local SMTP delivery.
6. Export a protected backup, test restoring it and rehearse the migration on a staging database. Never paste user records, hashes or credentials into ChatGPT.
7. Cut over frontend/API only after end-to-end tests, rollback plan and independent backups; leave Vercel/Supabase intact meanwhile.

**Do not apply this schema on a production service until the migration flow, restricted DB permissions, and backup restoration are implemented and tested.**

## Password actions foundation (003_password_actions.sql)

An opaque 32-byte reset/setup token is delivered only through a later verified email flow; the database stores only SHA-256, with strict 30-minute maximum validity, purpose, user ID and one-time consumption. Redemptions must atomically consume the token and update password credentials in one transaction while revoking all existing sessions. Do not expose any password reset endpoints until tested rate limiting, email verification, anti-enumeration, CSRF/origin controls, redirect allow-list, and email-delivery configuration are ready. This schema and token generator do not send emails and do not authenticate any user.

## Abuse controls foundation (004_auth_rate_limits.sql)

An internal PostgreSQL bucket table for per-account and per-network rate limits uses HMAC-SHA256 pseudonymous identifiers, not raw emails/IPs. The helper intentionally does not enable an endpoint, enforce a threshold or infer a client IP; those requirements must be implemented at the trusted proxy and API boundary before any public auth route is enabled. Never include HMAC key material in Git or logs. Password recovery must return a generic message whether or not an account exists.

## Session repository (internal, NOT deployed)

The API's session repository reads user identity and authorization role from PostgreSQL on each call, checks session expiration/revocation and user active/verified status, and revokes an opaque session token by hash. `/auth/me` and `/auth/logout` can be wired to these repository functions only after the API runs as a restricted PostgreSQL role and HTTPS proxy/client trust is configured and tested. Supabase sessions are not valid Aruba sessions.

## Least-privilege application identity (005_auth_runtime_role.sql)

Create a `NOLOGIN` group role `hollowgate_api_runtime` with only the SELECT/INSERT/UPDATE privileges currently required by the internal login/session services. It cannot change account roles, password credentials, raw password-action tokens, tables, or session identity fields. The CI test runs successful operations and privilege-escalation attempts using `SET ROLE`.

**Deployment is not yet authorized:** before applying this or any other auth schema to Aruba, create and verify an off-host backup, provision a separate login principal with a locally generated database password, decide secret provisioning without exposing it in chat or Git, and configure Compose to use that principal instead of the initial `hollowgate` owner. The initial Compose service stays unchanged for now. The password recovery workflow must be designed separately; do not grant broader access merely to make it work.

## Verified off-host backup before Aruba auth deployment

1. From the VPS, with the source branch updated, run `bash deploy/aruba/scripts/backup-and-verify.sh`. The script dumps the current local `hollowgate` database in custom PostgreSQL format to `/opt/hollowgate/data/backups` with permissions 600, checks the archive, restores into a **separate temporary database**, verifies it is reachable, and removes that temporary database. It does not modify the source database or stop the API.
2. Record the exact printed `VERIFIED_BACKUP_PATH` and checksum. On your **Windows PC** run `scp -i "$env:USERPROFILE\\.ssh\\hollowgate_aruba" -o IdentitiesOnly=yes hgadmin@212.237.9.78:/opt/hollowgate/data/backups/<actual-backup-filename>.dump "$env:USERPROFILE\\Documents\\"`. Replace the placeholder with the **actual basename** emitted by the script.
3. Run `Get-FileHash "$env:USERPROFILE\\Documents\\<actual-backup-filename>.dump" -Algorithm SHA256` in Windows PowerShell and compare the digest with the printed VPS SHA256. Keep the file in encrypted or otherwise access-controlled off-host storage, because future database dumps can contain sensitive personal data.
4. Do not delete the VPS copy until the off-host copy and restore rehearsal are verified. This does not replace a scheduled and tested backup policy.

The CI job validates the script against disposable PostgreSQL 17 data. **Do not run SQL migrations or enable auth yet**; the restricted runtime principal, secret distribution and deployment still require a separate safe step.

## Dedicated authentication staging API (port 3003)

`deploy/aruba/compose.auth-staging.yaml` intentionally starts a separate API container against `hollowgate_auth_test` as the restricted `hollowgate_auth_app` database login, reading a host-local 0600 password file through a Compose secret. It binds **only** to 127.0.0.1:3003 and leaves the existing 3001/3002 services untouched. Login routes are **not enabled**; /ready proves a PostgreSQL connection only. Before starting, verify the database role can authenticate with its password and SELECT its permitted tables, and that it cannot modify user roles. Do not add the secret file to Git. If `/ready` returns 503, inspect container logs without printing secrets.

## Login HTTP on staging port 3003

Starting with this revision the staging-only container can enable `POST /auth/login`, `GET /auth/me` and `POST /auth/logout`. It fails closed unless `AUTH_STAGING_ENABLED=true`, `PGDATABASE=hollowgate_auth_test` and `PGUSER=hollowgate_auth_app`. The host port is bound to `127.0.0.1:3003`, not exposed publicly. A persistent, random 32+ byte `/opt/hollowgate/config/auth_rate_limit_key` must be created by `hgadmin` on the VPS with mode 600 before recreating the staging container. This key is never committed, printed or transferred to clients. The test origin `https://staging.hollowgate.quest` is **not** a live deployment or an HTTPS proxy; use `curl` from the VPS with the corresponding Origin header solely for local functional tests. Secure cookies are not sent by browsers over plain HTTP. Do not alter the main API port 3002.

## Local-only end-to-end test

After confirming /ready HTTP 200 on the separate authentication staging container, run `bash deploy/aruba/scripts/test-auth-e2e.sh` from /opt/hollowgate/aruba-source. The script generates a disposable account and password, inserts only into `hollowgate_auth_test`, verifies wrong password/login/session/logout/revocation, and removes the fixture on exit. Secrets are passed on stdin and not shown in output. The test is intentionally restricted to the loopback port and does not activate public HTTPS or migrate real users.

## TLS staging edge (public diagnostics only)

Files: `deploy/aruba/Caddyfile.staging` and `deploy/aruba/compose.edge-staging.yaml`. Caddy handles automatic ACME certificate acquisition for **staging.hollowgate.quest only** after DNS is pointed to the VPS. It is a separate Compose project using the existing `hollowgate-auth-staging_default` network, resolving `aruba-auth-staging:3000` privately. Port 3003 remains bound to loopback. **Only /health and /ready are routed publicly; all other paths, including /auth/*, return 404** until further review. The root production hostname is never referenced in the host matcher.

Preflight: check `dig +short A staging.hollowgate.quest` (or `getent ahostsv4 staging.hollowgate.quest`) returns 212.237.9.78 and ensure AAAA does not point elsewhere; check no other service binds 80/443 with `sudo ss -lntp | grep -E ':(80|443)\\b'`. Do not install if ports already used. Create the staging DNS A record at the domain's actual DNS provider without changing `hollowgate.quest` or `www` or MX/SPF/DKIM/DMARC. Then run `sudo docker compose -f deploy/aruba/compose.edge-staging.yaml config`, and `sudo docker compose -f deploy/aruba/compose.edge-staging.yaml up -d`. Verify `curl -i https://staging.hollowgate.quest/health`, `curl -i https://staging.hollowgate.quest/ready`, and `curl -i https://staging.hollowgate.quest/auth/me` (expected 404 until explicitly enabled). Do not claim the certificate has been issued before the HTTPS probe succeeds.

**Email**: sender `no-reply@hollowgate.quest` is not yet provisioned. Do not publish invented DNS records or send messages before choosing a transactional email provider and verifying ownership, SPF, DKIM and DMARC; existing MX and SPF entries must be preserved or adjusted deliberately to prevent mail disruption.

## Transactional email adapter (not enabled in containers)

\`apps/aruba-api/src/transactional-mail.mjs\` provides a send-only adapter for Resend, configured to use \`Hollowgate <no-reply@hollowgate.quest>\`. It is **not imported by the running backend**, not connected to public auth endpoints, and does not send until explicitly called by a future verified password-action flow. API tokens MUST be saved as a host-only secret with mode 600, never checked into Git or passed to a web browser. Mocked unit tests verify the request, idempotency and that provider error details are not returned to callers.

Before any real send:
1. Create a Resend account at https://resend.com and add \`hollowgate.quest\` as a sending domain (or select a deliberate, separately verified sending subdomain).
2. Copy **only provider-generated** SPF/DKIM and return-path records to the authoritative Namecheap DNS panel. Do not replace existing MX/website records or publish guessed DNS values. Verify the sending domain in the provider dashboard.
3. Issue a minimally scoped sending API key, provision it locally on Aruba as a protected secret (not in Git/chat), and test deliverability to an address you control.
4. Implement rate-limited reset requests, atomic one-time token redemption, email verification, trusted redirects, server-side audit and outbound delivery logs **without storing raw reset URLs/tokens**. Never send real password-reset links while the staging URL has no verified frontend that can redeem them.

## Password reset implementation (not activated)

Added apps/aruba-api/src/password-reset-service.mjs with unit tests and deploy/aruba/sql/006_password_reset_runtime.sql. The migration has NOT been applied; the service is NOT imported by the running API and the Caddy edge still exposes only /health and /ready. No real users or credentials have been modified.

The service accepts reset requests with per-account and per-network HMAC-hashed database counters, uses identical generic acknowledgement for unknown and existing accounts, and emails a 256-bit opaque token to verified active accounts only. Only SHA-256 token digests are stored; action expires in 30 minutes. Redemption claims an unconsumed token atomically inside the same database transaction that updates Argon2id credentials and revokes all existing sessions. Failures roll back the transaction. Production activation still requires test database permission rehearsal, concurrent redemption tests against PostgreSQL, verified browser frontend, Origin/CSRF checks, abuse defense at proxy boundaries, Docker secret mounting for Resend, and email verification/registration workflows.

## Password reset HTTP wiring (opt-in, still disabled)

The routes POST /auth/password/request and POST /auth/password/redeem are now wired through apps/aruba-api/src/auth-http.mjs using exact HTTPS Origin checks and size-limited JSON; the first uses generic HTTP 202 and the second HTTP 200 on successful one-time redemption. They are only present when the index process has AUTH_STAGING_ENABLED=true, AUTH_PASSWORD_RESET_ENABLED=true, PGDATABASE=hollowgate_auth_test, PGUSER=hollowgate_auth_app, RESEND_API_KEY_FILE pointing to a protected secret, and the restricted migration 006 is deliberately applied. Neither the Compose staging file nor the production API sets AUTH_PASSWORD_RESET_ENABLED, and the public Caddy proxy still returns 404 for all /auth endpoints. Unit HTTP tests are mocked and do not send real mail. Do not activate until DB permission/concurrency tests, secret mounting, rate limiting and browser frontend are verified. The other registration/email-verification flow is still outstanding.
