# VPS recovery — 24 November 2026

This recovery record supersedes prior claims that the catalog was ready to
deploy. No successful catalog deployment has been established.

## Confirmed by operator output

- Running production API: `hollowgate-production-private-aruba-api-1`,
  image `hollowgate-api-core-candidate:20261120`,
  ID `sha256:bcd09271044abccd52969b322881dd816258466f4ca97a6690609524e87a7a93`.
- Original `compose.private.yaml` and `compose.private-port.yaml` are missing
  under `/home/hgadmin/hollowgate-private-upload/hollowgate-aruba-production-linux`.
  Do NOT recreate or stop the running container.
- Three original bind source files were missing: `auth_hmac_key`,
  `postgres_password`, `resend_api_key`. Readable inside the running container.
  Recovered to `/opt/hollowgate/backups/recovered-api-secrets-20261124T125840Z`,
  compared by SHA256 to container contents and restored at original source
  paths with UID/GID 1001 and mode 0400. Operator confirmed all three restores.
  No secret values were printed.
- Docker inspect snapshots, Caddyfile and surviving overlays saved at
  `/opt/hollowgate/backups/deployment-config-20261124T125541Z`.
- Generated recovery candidate:
  `compose-recovery-candidate-87y60tvj/compose.json` under that directory.
  Operator confirmed `RECOVERY_COMPOSE_VALIDATED`.
  This is syntax validation ONLY, not full configuration equivalence, restore
  rehearsal or authorization to run Compose up/down.
- Frontend source mount:
  `/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot` -> `/srv/vtt-pilot`.
  Public Caddy API matcher includes `/auth/* /vtt/* /health /ready`.
- Source-only tar backup: `/opt/hollowgate/backups/hg-release-backup-20261124T133314Z.tgz`.
  NOT a verified PostgreSQL backup.

## Stop unsafe procedures

Do not run `install-private.sh`: it is an initial installer that replays old
migrations, runs historical ETL against `hollowgate`, and changes runtime
configuration. sudo environment stripping can make its initial `test` checks
exit silently; piping through tail hides the installer's exit status.
Do not delete or clean the original active deployment directory.

## Additional local release blockers discovered

- `index.mjs` constructs `nativeGlobalEditor` but does not pass it to
  `createAuthHttpHandler`.
- Historical SQL 040 grants access to ownerless campaignless records to any
  active verified account. This is not an authorized ownership policy and must
  not ship.
- Historical SQL assumes tables under `hollowgate_vtt`; authoritative deployed
  storage needs verification, not stub-only fixture evidence.
- Earlier passing tests and HTTP 200 do not prove complete UI integration,
  secure authorization, a successful production update or a clean browser gate.

Next: verify recovery candidate equivalence and preserved image, obtain and
restore-test a PostgreSQL backup in isolation, audit/fix candidate code and
test privately before considering any live update.

## Local safety repair

- Initial installer now refuses ordinary invocation before performing work.
- Historical runtime is quarantined (default off; explicit enable refused
  pending authoritative schema/ownership acceptance). Historical query return
  shape corrected; SQL denies orphan/invalid owners and unverified accounts.
- Experimental global editor 007 is not constructed or required by startup.
  Code/SQL remain preserved for review; do not apply 007.
- Native campaign projection 006 excludes archived entries and checks owner.
  Startup regression fixture now applies its actual required migration 006.
- Reproducible local command: `node deploy/aruba/production/verify-update.mjs`.
  Per-step protected-from-console logs and JSON report under `.local/update-checks`.
  It checks actual process exit codes, never prints build success as a substitute
  for exit status, and never connects to VPS or packages historical exports.
- Latest local run: API 304/304, frontend 525/525, catalog DB 46/46,
  historical DB 2/2; public and contract builds exit 0.
  DB tests use PGlite, not real multi-connection PostgreSQL.
- This run is NOT browser acceptance, a verified DB backup, a deployment or
  permission to ship. Single-command live promotion/rollback is still to be
  implemented and rehearsed; see `production/UPDATE-PROCEDURE.md`.
