#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
base=/home/hgadmin/hollowgate-private-upload
log="$base/private-install.log"
container=hollowgate-postgres-1
database=hollowgate
user=hollowgate
finish(){ chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true; }
trap finish EXIT
exec >"$log" 2>&1

echo '0/8 Proving every existing Aruba table is empty...'
mapfile -t tables < <(docker exec "$container" psql -X -U "$user" -d "$database" -Atqc \
  "SELECT format('%I.%I',schemaname,relname) FROM pg_stat_user_tables WHERE schemaname IN ('hollowgate_auth','hollowgate_vtt') ORDER BY 1")
for table in "${tables[@]}"; do
  count="$(docker exec "$container" psql -X -U "$user" -d "$database" -Atqc "SELECT count(*) FROM $table")"
  if [[ "$count" != 0 ]]; then echo "REFUSING_NONEMPTY_TABLE=$table:$count"; exit 1; fi
done
echo "EMPTY_TABLES_VERIFIED=${#tables[@]}"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U "$user" -d "$database" \
  -c 'DROP SCHEMA IF EXISTS hollowgate_vtt CASCADE; DROP SCHEMA IF EXISTS hollowgate_auth CASCADE;'

rm -rf /opt/hollowgate/migration-private
install -d -o 1000 -g 1000 -m 700 /opt/hollowgate/migration-private/{data,scripts}
install -o 1000 -g 1000 -m 600 "$base/hollowgate-aruba-production-linux/migration/data/"* /opt/hollowgate/migration-private/data/
install -o 1000 -g 1000 -m 500 "$base/hollowgate-aruba-production-linux/migration/scripts/"* /opt/hollowgate/migration-private/scripts/

echo 'Starting definitive private installer...'
HOME=/home/hgadmin \
HG_RELEASE_DIR="$base/hollowgate-aruba-production-linux" \
bash "$base/install-private.sh"
