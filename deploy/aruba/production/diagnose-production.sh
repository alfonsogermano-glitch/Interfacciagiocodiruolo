#!/usr/bin/env bash
set -Eeuo pipefail
log=/home/hgadmin/hollowgate-private-upload/production-diagnostic.log
container=hollowgate-postgres-1
database=hollowgate
user=hollowgate
exec >"$log" 2>&1
echo '=== SCHEMAS ==='
docker exec "$container" psql -X -P pager=off -U "$user" -d "$database" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('hollowgate_auth','hollowgate_vtt') ORDER BY 1"
echo '=== CAMPAIGN FUNCTION ==='
docker exec "$container" psql -X -P pager=off -U "$user" -d "$database" -c "SELECT p.oid::regprocedure AS signature,pg_get_function_result(p.oid) AS result FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hollowgate_vtt' AND p.proname='list_owned_campaigns'"
echo '=== TABLE ROW ESTIMATES ==='
docker exec "$container" psql -X -P pager=off -U "$user" -d "$database" -c "SELECT schemaname,relname,n_live_tup FROM pg_stat_user_tables WHERE schemaname IN ('hollowgate_auth','hollowgate_vtt') ORDER BY 1,2"
echo '=== MIGRATION LEDGER ==='
docker exec "$container" psql -X -P pager=off -U "$user" -d "$database" -Atqc "SELECT CASE WHEN to_regclass('hollowgate_vtt.migration_source_records') IS NULL THEN 'missing' ELSE 'present' END"
echo DIAGNOSTIC_OK
chown hgadmin:hgadmin "$log"
chmod 600 "$log"
