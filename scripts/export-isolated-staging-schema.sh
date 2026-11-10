#!/usr/bin/env bash
# Export schema ONLY from an explicitly local, isolated PostgreSQL staging database.
# Never used to export the managed Supabase project or real user data.
set -Eeuo pipefail
umask 077

refuse() { printf 'REFUSED: %s\n' "$1" >&2; exit 2; }
[[ "${SCHEMA_EXPORT_CONFIRM:-}" == "ISOLATED_LOCAL_ONLY" ]] || refuse 'set SCHEMA_EXPORT_CONFIRM=ISOLATED_LOCAL_ONLY'
[[ "$#" == 0 ]] || refuse 'no command-line arguments are accepted'

# The connection is made exclusively using PGHOST/PGPORT/PGUSER/PGDATABASE.
# Avoid DATABASE_URL/PGSERVICE env overrides and accidental cloud endpoints.
for var in DATABASE_URL SUPABASE_URL SUPABASE_DB_PASSWORD SUPABASE_ACCESS_TOKEN PGSERVICE PGSERVICEFILE PGHOSTADDR; do
  [[ -z "${!var:-}" ]] || refuse "$var is set"
done
[[ "${PGHOST:-}" == "127.0.0.1" || "${PGHOST:-}" == "::1" ]] || refuse 'PGHOST must be 127.0.0.1 or ::1'
[[ -n "${PGDATABASE:-}" && -n "${PGUSER:-}" ]] || refuse 'PGDATABASE and PGUSER are required'
[[ "${PGDATABASE}" != "postgres" && "${PGDATABASE}" != "template0" && "${PGDATABASE}" != "template1" ]] || refuse 'use a named isolated staging database'
[[ "${PGPORT:-}" =~ ^[0-9]+$ ]] || refuse 'PGPORT must be numeric'
((10#${PGPORT} > 0 && 10#${PGPORT} < 65536)) || refuse 'invalid PGPORT'
[[ -z "${PGOPTIONS:-}" ]] || refuse 'PGOPTIONS is not allowed'
[[ "${PGSSLMODE:-disable}" == "disable" ]] || refuse 'local-only rehearsals require PGSSLMODE=disable'
[[ -n "${SCHEMA_EXPORT_DIR:-}" && "${SCHEMA_EXPORT_DIR}" == /* ]] || refuse 'SCHEMA_EXPORT_DIR must be an absolute path'
for tool in python3 pg_dump pg_restore sha256sum mktemp; do
  command -v "$tool" >/dev/null 2>&1 || refuse "missing $tool"
done

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# Use resolve(strict=False) to catch symlink aliases into the repository.
if ! python3 - "$repo" "$SCHEMA_EXPORT_DIR" <<'PY'
import pathlib, sys
repo = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
if destination == repo or repo in destination.parents:
    raise SystemExit(1)
if destination.exists():
    raise SystemExit(1)
if not destination.parent.is_dir():
    raise SystemExit(1)
PY
then
  refuse 'destination must be new, outside Git and under an existing directory'
fi

export PGSSLMODE=disable
# Authentication is via local peer credentials or an operator-provided PGPASSFILE.
# Never pass connection strings or passwords as CLI arguments.
mkdir -m 700 -- "$SCHEMA_EXPORT_DIR" || refuse 'cannot create protected export directory'
partial="$SCHEMA_EXPORT_DIR/schema.dump.partial"
cleanup() { [[ ! -f "$partial" ]] || rm -f -- "$partial"; }
trap cleanup EXIT
pg_dump --schema-only --format=custom --no-owner --no-acl --file="$partial"
test -s "$partial" || refuse 'empty schema archive'
pg_restore --list "$partial" > "$SCHEMA_EXPORT_DIR/schema.toc"
test -s "$SCHEMA_EXPORT_DIR/schema.toc" || refuse 'empty table of contents'
mv -- "$partial" "$SCHEMA_EXPORT_DIR/schema.dump"
(
  cd "$SCHEMA_EXPORT_DIR"
  sha256sum schema.dump schema.toc > SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)
printf 'PASS: isolated local schema archive and checksums: %s\n' "$SCHEMA_EXPORT_DIR"
printf '%s\n' 'NOTE: owner/ACL excluded. No production backup, no data, no restore, no Supabase system migration.'
