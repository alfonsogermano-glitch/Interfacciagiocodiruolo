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
