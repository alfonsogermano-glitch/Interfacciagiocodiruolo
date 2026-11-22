#!/usr/bin/env bash
# Staging ONLY. One command: backup/restore rehearsal, 033+037, SQL regression,
# and staging API feature opt-in. Never restores a stale dump over new users.
set -Eeuo pipefail
umask 077
die(){ echo "STAGING_INVITES_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run once with sudo on staging VPS'
[[ ( $# == 2 || ( $# == 3 && $3 == --resume-after-restore ) ) && $2 =~ ^[a-f0-9]{64}$ ]] ||
  die 'usage: enable-staging-campaign-invites-qa.sh /home/hgadmin/hg-staging-invites-qa-20261121 SHA256SUMS_DIGEST [--resume-after-restore]'
bundle=$1
resume=${3:-}
[[ $bundle == /home/hgadmin/hg-staging-invites-qa-20261121 ]] || die 'unexpected bundle path'
for file in 033_vtt_campaign_invites.sql 037_staging_database_role.sql test_vtt_campaign_invites.sql compose.staging-invites-qa.yaml; do
  [[ -f $bundle/$file && ! -L $bundle/$file ]] || die 'bundle file missing or symlink'
done
[[ -f $bundle/SHA256SUMS && ! -L $bundle/SHA256SUMS ]] || die 'hash manifest missing'
[[ $(sha256sum "$bundle/SHA256SUMS" | cut -d' ' -f1) == "$2" ]] || die 'manifest digest mismatch'
(cd "$bundle" && sha256sum --status -c SHA256SUMS) || die 'bundle SHA-256 mismatch'
db=hollowgate_auth_test
clone=hollowgate_auth_invites_verify_20261121
pg=hollowgate-postgres-1
project=hollowgate-auth-staging
api_service=aruba-auth-staging
backup=/opt/hollowgate-staging-invites-qa-20261121
base=/opt/hollowgate/aruba-source/deploy/aruba
trial=/opt/hollowgate/staging-trial
gateway=hollowgate-staging-edge-caddy-1
files=(-p "$project"
  -f "$base/compose.auth-staging.yaml"
  -f "$base/compose.auth-trial.yaml"
  -f "$base/compose.campaign-trial.yaml"
  -f "$base/compose.character-trial.yaml"
  -f "$trial/compose.staging-db-role.yaml"
  -f "$trial/compose.staging-api-source.yaml"
  -f "$trial/compose.oauth-trial.yaml")
overlay=(-f "$bundle/compose.staging-invites-qa.yaml")

ids=$(docker ps --filter label=com.docker.compose.project="$project" \
  --filter label=com.docker.compose.service="$api_service" --format '{{.ID}}')
[[ -n $ids && $ids != *$'\n'* ]] || die 'expected one staging API container'
api=$ids
[[ $(docker exec "$api" node -p 'process.env.PGDATABASE') == "$db" &&
   $(docker exec "$api" node -p 'process.env.PGUSER') == hollowgate_auth_staging_app &&
   $(docker exec "$api" node -p 'process.env.AUTH_VTT_CAMPAIGN_INVITES_ENABLED ?? "unset"') == unset ]] ||
  die 'not the isolated staging runtime or flag already set'
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$api") == \
  "$base/compose.auth-staging.yaml,$base/compose.auth-trial.yaml,$base/compose.campaign-trial.yaml,$base/compose.character-trial.yaml,$trial/compose.staging-db-role.yaml,$trial/compose.staging-api-source.yaml,$trial/compose.oauth-trial.yaml" ]] ||
  die 'staging Compose file list changed'
old_image=$(docker inspect --format '{{.Image}}' "$api")
docker exec "$api" node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" ||
  die 'staging API not ready before test'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] ||
  die 'production health not 200 before staging test'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hollowgate_vtt' AND c.relname='campaign_invites'") == 0 ]] ||
  die 'migration already applied or schema unexpected'
clone_exists=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname='$clone'")
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM hollowgate_auth.users WHERE email IN ('invite-owner@example.org','invite-player@example.org','invite-outsider@example.org')") == 0 ]] ||
  die 'SQL regression fixture emails already exist; no change made'
if [[ $resume == --resume-after-restore ]]; then
  [[ $clone_exists == 1 && -s $backup/staging.dump ]] ||
    die 'prior clone/backup missing; cannot resume'
  [[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" \
    -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hollowgate_vtt' AND c.relname='campaign_invites'") == 0 ]] ||
    die 'clone already migrated; cannot resume this checkpoint'
else
  [[ $clone_exists == 0 && ! -e $backup ]] ||
    die 'clone or backup already exists; do not repeat (use reviewed resume)'
fi

# IDs are not secrets, but keep them out of command output and shell history.
export HG_STAGING_GOOGLE_CLIENT_ID HG_STAGING_DISCORD_CLIENT_ID
HG_STAGING_GOOGLE_CLIENT_ID=$(docker exec "$api" node -p 'process.env.GOOGLE_OAUTH_CLIENT_ID ?? ""')
HG_STAGING_DISCORD_CLIENT_ID=$(docker exec "$api" node -p 'process.env.DISCORD_OAUTH_CLIENT_ID ?? ""')
[[ -n $HG_STAGING_GOOGLE_CLIENT_ID && -n $HG_STAGING_DISCORD_CLIENT_ID ]] ||
  die 'staging OAuth client IDs absent'
docker compose "${files[@]}" "${overlay[@]}" config --quiet || die 'staging Compose invalid'
docker compose "${files[@]}" "${overlay[@]}" config --format json |
  python3 -c '
import json,sys
s=json.load(sys.stdin)["services"]["aruba-auth-staging"]; e=s["environment"]
assert e["PGDATABASE"]=="hollowgate_auth_test" and e["PGUSER"]=="hollowgate_auth_staging_app"
assert e["AUTH_STAGING_ENABLED"]=="true" and e["AUTH_VTT_CAMPAIGNS_ENABLED"]=="true"
assert e["AUTH_VTT_CAMPAIGN_INVITES_ENABLED"]=="true" and e["AUTH_OAUTH_ENABLED"]=="true"
' || die 'unsafe effective staging environment'

# Fresh backup with exact staging data and a full restore rehearsal, never the
# live production DB. On error the clone is retained for investigation.
if [[ $resume != --resume-after-restore ]]; then
  mkdir -m 700 "$backup"
  docker exec "$pg" pg_dump -Fc -U hollowgate -d "$db" > "$backup/staging.dump"
  [[ -s $backup/staging.dump ]] || die 'staging dump empty'
  docker exec "$pg" createdb -U hollowgate -T template0 "$clone"
  docker exec -i "$pg" pg_restore --exit-on-error --no-owner -U hollowgate -d "$clone" \
    < "$backup/staging.dump" > /dev/null
fi
counts=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c 'SELECT (SELECT count(*) FROM hollowgate_auth.users),(SELECT count(*) FROM hollowgate_vtt.campaigns)')
restored=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" \
  -c 'SELECT (SELECT count(*) FROM hollowgate_auth.users),(SELECT count(*) FROM hollowgate_vtt.campaigns)')
[[ $counts == "$restored" ]] || die 'restore counts differ'
echo 'STAGING_BACKUP_RESTORED_AND_COUNTS_OK'

# 033 begins with comments before BEGIN. Strip only one exact standalone
# BEGIN/COMMIT pair; --single-transaction then includes the 037 grant sync.
[[ $(grep -xc '^BEGIN;$' "$bundle/033_vtt_campaign_invites.sql") == 1 &&
   $(grep -xc '^COMMIT;$' "$bundle/033_vtt_campaign_invites.sql") == 1 ]] ||
  die 'unexpected 033 transaction wrapper'
strip_033(){ sed '/^BEGIN;$/d; /^COMMIT;$/d' "$bundle/033_vtt_campaign_invites.sql"; }
strip_033 | docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 --single-transaction \
  -U hollowgate -d "$clone" -f - > /dev/null || die '033 clone rehearsal failed'
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -f - \
  < "$bundle/test_vtt_campaign_invites.sql" > /dev/null || die 'SQL invite regression failed on clone'
echo 'STAGING_CLONE_INVITES_SQL_OK'

# On staging, 033 and 037 commit together; the SQL regression rolls its own
# synthetic users/campaign back. If a later check fails, leave the feature OFF.
{ strip_033; cat "$bundle/037_staging_database_role.sql"; } |
  docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 --single-transaction \
    -U hollowgate -d "$db" -f - > /dev/null || die 'staging migration/grants failed; API unchanged'
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -f - \
  < "$bundle/test_vtt_campaign_invites.sql" > /dev/null || die 'staging invite regression failed; flag remains OFF'
grants=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -c "SELECT
  has_function_privilege('hollowgate_auth_staging_app','hollowgate_vtt.rotate_owned_campaign_invite(uuid,uuid,bytea,timestamptz)','EXECUTE'),
  has_function_privilege('hollowgate_auth_staging_app','hollowgate_vtt.preview_campaign_invite(uuid,bytea)','EXECUTE'),
  has_function_privilege('hollowgate_auth_staging_app','hollowgate_vtt.join_campaign_by_invite(uuid,bytea)','EXECUTE'),
  has_table_privilege('hollowgate_auth_staging_app','hollowgate_vtt.campaign_invites','INSERT')")
[[ $grants == 't|t|t|f' ]] || die 'restricted staging grants unexpected; flag remains OFF'

rollback(){
  local status=$1
  trap - EXIT
  if (( status == 0 || recreating == 0 )); then return; fi
  echo 'STAGING_INVITES_API_FAILED: restoring prior staging Compose (SQL retained)' >&2
  if docker compose "${files[@]}" up -d --no-deps --no-build --force-recreate "$api_service"; then
    echo 'STAGING_INVITES_API_ROLLBACK_OK' >&2
  else
    echo 'STAGING_INVITES_API_ROLLBACK_INCOMPLETE' >&2
  fi
}
recreating=0
trap 'rollback $?' EXIT
trap 'exit 1' HUP INT TERM
recreating=1
docker compose "${files[@]}" "${overlay[@]}" up -d --no-deps --no-build --force-recreate "$api_service"
ids=$(docker ps --filter label=com.docker.compose.project="$project" \
  --filter label=com.docker.compose.service="$api_service" --format '{{.ID}}')
[[ -n $ids && $ids != *$'\n'* ]] || die 'staging API not running'
[[ $(docker inspect --format '{{.Image}}' "$ids") == "$old_image" &&
   $(docker exec "$ids" node -p 'process.env.PGDATABASE') == "$db" &&
   $(docker exec "$ids" node -p 'process.env.AUTH_VTT_CAMPAIGN_INVITES_ENABLED') == true ]] ||
  die 'wrong staging runtime after recreation'
docker exec "$ids" node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" ||
  die 'staging API not ready after recreation'
docker exec "$gateway" sh -c 'wget -q -O /dev/null http://aruba-auth-staging:3000/ready' ||
  die 'gateway cannot reach staging API'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] ||
  die 'public production health failed during staging test'
echo 'STAGING_INVITES_QA_READY — refresh staging VTT; production untouched'
