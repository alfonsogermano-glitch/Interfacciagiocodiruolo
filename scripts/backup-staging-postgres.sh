#!/usr/bin/env bash
# Hollowgate: PostgreSQL staging backup. Never commits or uploads data.
set -Eeuo pipefail
umask 077

if [[ "${BACKUP_SOURCE:-}" != "staging" ]]; then
  echo "REFUSED: set BACKUP_SOURCE=staging. Production backup requires a separately reviewed procedure." >&2
  exit 2
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "REFUSED: DATABASE_URL is required (do not pass it as a command-line argument)." >&2
  exit 2
fi
for tool in pg_dump pg_restore sha256sum date mktemp; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }
done
if [[ -z "${BACKUP_DIR:-}" || "$BACKUP_DIR" != /* ]]; then
  echo "REFUSED: BACKUP_DIR must be an absolute path outside the repository." >&2
  exit 2
fi
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dir="$(mktemp -d "$BACKUP_DIR/hollowgate-staging-$stamp-XXXXXX")"
chmod 700 "$dir"
cleanup() { if [[ -n "${tmp:-}" && -e "$tmp" ]]; then rm -f "$tmp"; fi; }
trap cleanup EXIT
tmp="$dir/database.dump.partial"
# pg_dump custom format is independently inspectable with pg_restore -l.
# --no-owner and --no-acl improve portability; they do not remove sensitive data.
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-acl --file="$tmp"
pg_restore --list "$tmp" > "$dir/database.toc"
test -s "$dir/database.toc"
mv "$tmp" "$dir/database.dump"
tmp=""
(
  cd "$dir"
  sha256sum database.dump database.toc > SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)
printf '%s\n' "Backup staging created and checksum verified: $dir"
printf '%s\n' "IMPORTANT: no restore has been performed. Storage objects and Auth/service config require separate inventory and restore tests."
