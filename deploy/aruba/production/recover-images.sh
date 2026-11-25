#!/usr/bin/env bash
# Selective image recovery. No frontend/API/container lifecycle changes.
set -Eeuo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run with sudo' >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "$0")" && pwd)
pg=hollowgate-postgres-1
db=hollowgate
mode=${1:---preflight}
[[ $mode == --preflight || $mode == --apply || $mode == --verify || $mode == --rollback ]] ||
 { echo 'Use --preflight, --apply, --verify or --rollback' >&2; exit 1; }
cd "$bundle"
sha256sum --quiet -c SHA256SUMS
sql() {
 docker exec -i "$pg" psql -X -q -v ON_ERROR_STOP=1 -U hollowgate -d "$1" < "$2"
}
# Do not print SQL failure context: private recovery SQL contains image bytes.
log=$(mktemp /opt/hollowgate/backups/image-recovery-log.XXXXXXXX)
stage=preflight
trap 'echo "IMAGE_RECOVERY_STOPPED: stage=$stage; inspect private log $log; do not paste image SQL" >&2' ERR
if [[ $mode == --preflight ]]; then
 sql "$db" "$bundle/preflight.sql" > "$log" 2>&1
 echo 'IMAGE_RECOVERY_PREFLIGHT_OK: read-only; no images changed'
 exit 0
fi
if [[ $mode == --verify ]]; then
 sql "$db" "$bundle/verify.sql" > "$log" 2>&1
 echo 'IMAGE_RECOVERY_VERIFY_OK'
 exit 0
fi
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="/opt/hollowgate/backups/image-recovery-06-$stamp"
mkdir -m 700 "$backup"
cp "$bundle/SHA256SUMS" "$bundle/summary.json" "$bundle/rollback.sql" "$backup/"
signature() {
 local table
 for table in campaigns character_drafts narrative_content_documents visual_assets character_portraits character_portrait_sources; do
  docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$1" -c \
   "SELECT '$table',count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),'')) FROM hollowgate_vtt.$table t"
 done
}
rollback_signature() {
 docker exec -i "$pg" psql -X -qAt -v ON_ERROR_STOP=1 -v "revision_delta=$2" \
  -U hollowgate -d "$1" < "$bundle/rollback-signature.sql"
}
if [[ $mode == --apply ]]; then
 sql "$db" "$bundle/preflight.sql" > "$log" 2>&1
fi
signature "$db" > "$backup/before.signature"
rollback_signature "$db" 0 > "$backup/original-without-assets.signature"
stage=backup_restore
docker exec "$pg" pg_dump -Fc -U hollowgate -d "$db" > "$backup/production.dump" 2>> "$log"
[[ -s $backup/production.dump ]]
docker exec -i "$pg" pg_restore -l < "$backup/production.dump" > "$backup/archive.list" 2>> "$log"
clone="hg_image_recovery_${stamp,,}"
[[ $clone =~ ^hg_image_recovery_[0-9]{8}t[0-9]{6}z$ ]]
docker exec "$pg" createdb -U hollowgate -T template0 "$clone" >> "$log" 2>&1
docker exec "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
 -c "REVOKE CONNECT ON DATABASE \"$clone\" FROM PUBLIC" >> "$log" 2>&1
docker exec -i "$pg" pg_restore --exit-on-error --no-owner -U hollowgate -d "$clone" \
 < "$backup/production.dump" >> "$log" 2>&1
signature "$clone" > "$backup/restored.signature"
cmp -s "$backup/before.signature" "$backup/restored.signature"
signature "$db" > "$backup/live-after-backup.signature"
cmp -s "$backup/before.signature" "$backup/live-after-backup.signature"
echo "IMAGE_BACKUP_RESTORE_OK: $backup; clone=$clone"
if [[ $mode == --apply ]]; then
 stage=clone_apply
 sql "$clone" "$bundle/apply.sql" >> "$log" 2>&1
 stage=clone_verify
 sql "$clone" "$bundle/verify.sql" >> "$log" 2>&1
 # Prove conditional rollback on the clone before touching production.
 stage=clone_rollback
 sql "$clone" "$bundle/rollback.sql" >> "$log" 2>&1
 # Added assets are deliberately retained; other tables must match exactly.
 # Migration 039 increments PG revision for each child INSERT/DELETE:
 # portrait + source insertion + their deletion = exactly four increments.
 # Only updated_at for restored PGs is excluded; every other value is compared.
 rollback_signature "$clone" 4 > "$backup/rollback.signature"
 stage=clone_rollback_comparison
 cmp -s "$backup/rollback.signature" "$backup/original-without-assets.signature"
 echo 'IMAGE_CLONE_APPLY_VERIFY_ROLLBACK_OK'
 stage=production_apply
 sql "$db" "$bundle/apply.sql" >> "$log" 2>&1
 stage=production_verify
 sql "$db" "$bundle/verify.sql" >> "$log" 2>&1
 echo "IMAGE_RECOVERY_OK: image-recovery-06; backup=$backup; frontend and API unchanged"
else
 sql "$clone" "$bundle/rollback.sql" >> "$log" 2>&1
 sql "$db" "$bundle/rollback.sql" >> "$log" 2>&1
 echo "IMAGE_RECOVERY_ROLLBACK_OK: references detached; visual assets retained; backup=$backup"
fi
