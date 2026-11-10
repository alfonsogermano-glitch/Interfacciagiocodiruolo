# Chat reactions — additional audit findings (2026-11-10)

Read-only production catalog inspection:

- No public SQL function whose name includes `chat`, `react`, or `message` implements public chat reaction updates. The functions discovered under those name patterns concern **private** chat.
- No triggers were listed on `public.chat_messages` in `information_schema.triggers`.
- `authenticated` has effective UPDATE privileges on all ten columns of `public.chat_messages`, not only `reactions`.
- These facts do **not** establish the frontend implementation. A frontend client can call PostgREST directly; finding that call site still requires repository file inspection.

## New regression check
`tests/security/chat_reaction_grants_catalog.sql` checks **effective** column UPDATE permissions via `has_column_privilege`, rather than trusting raw GRANT listings. It expects only `reactions` to be UPDATE-able by `authenticated` and requires the new campaign-scoped UPDATE policy to exist. Run on disposable staging **after** applying the two draft SQL proposals. Expected to fail on production; do not execute modifications there.

## Compatibility caveats
- Column grants can break PostgREST calls that update more than `reactions` or require UPDATE privileges for additional columns.
- JSON reaction payloads and concurrency still need application-level tests; column grants do not validate JSON structure or protect against lost updates.
- Existing `chat_messages_delete` policy should also be reviewed for campaign membership and the expected GM moderation behavior.
- No staging deployment or end-to-end verification has occurred. Do not merge the proposals into production migrations.
