#!/usr/bin/env bash
# Verify a PostgreSQL backup by restoring it into an isolated disposable DB.
# Usage: bash deploy/aruba/scripts/backup-and-verify.sh
# Creates no account data; does not touch the production database schema.
set -Eeuo pipefail
umask 077

container="${HG_POSTGRES_CONTAINER:-hollowgate-postgres-1}"
database="${HG_POSTGRES_DATABASE:-hollowgate}"
dbuser="${HG_POSTGRES_USER:-hollowgate}"
backup_dir="${HG_BACKUP_DIR:-/opt/hollowgate/data/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/hollowgate-$stamp.dump"
tmp_db="hg_restore_check_$(date +%s)_$$"
created=0
success=0

cleanup() {
  if [[ "$created" == 1 ]]; then
    if ! sudo docker exec "$container" dropdb --if-exists -U "$dbuser" "$tmp_db"; then
      printf 'WARNING: temporary restore database still exists: %s\n' "$tmp_db" >&2
    fi
  fi
  if [[ "$success" != 1 ]]; then
    printf 'Backup verification failed; review local file before relying on it.\n' >&2
  fi
}
trap cleanup EXIT

if [[ ! "$container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ||
      ! "$database" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ||
      ! "$dbuser" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
  echo 'Invalid container/database/user name' >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
if [[ -e "$backup_file" ]]; then
  echo 'Backup filename already exists; refusing to overwrite' >&2
  exit 1
fi

echo '1/4 Creating PostgreSQL custom-format dump...'
sudo docker exec "$container" pg_dump -U "$dbuser" -d "$database" -Fc > "$backup_file"
chmod 600 -- "$backup_file"
test -s "$backup_file"
echo '2/4 Validating PostgreSQL archive directory...'
sudo docker exec -i "$container" pg_restore -l < "$backup_file" > /dev/null

echo '3/4 Restoring to a separate temporary database...'
sudo docker exec "$container" createdb -U "$dbuser" "$tmp_db"
created=1
sudo docker exec -i "$container" pg_restore -U "$dbuser" -d "$tmp_db" --exit-on-error --no-owner --no-acl < "$backup_file"

echo '4/4 Checking restored database connectivity...'
sudo docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$dbuser" -d "$tmp_db" -Atqc 'SELECT current_database();' | grep -Fx "$tmp_db" > /dev/null
success=1
printf 'VERIFIED_BACKUP_PATH=%s\n' "$backup_file"
sha256sum -- "$backup_file"
echo 'Backup and test restore succeeded. Transfer this protected dump off the VPS.'
