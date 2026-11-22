#!/usr/bin/env bash
# APPROVED STAGING ONLY: eight migrations + unchanged 037, then five flags.
# Existing image, networks, secret mounts and other environment values are
# compared before recreation. NO production changes or gateway recreation.
set -Eeuo pipefail
umask 077
die(){ echo "STAGING_RECOVERY_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'approved sudo session required'
[[ $# == 1 && $1 =~ ^[a-f0-9]{64}$ ]] || die 'expected pinned manifest SHA-256'
source=/home/hgadmin/hg-staging-campaign-apply-20261121
work=/opt/hollowgate-staging-campaign-apply-20261121
rehearsal=/opt/hollowgate-campaign-clone-recovery-20261121
db=hollowgate_auth_test
pg=hollowgate-postgres-1
project=hollowgate-auth-staging
service=aruba-auth-staging
tag=hollowgate-staging-campaign-pin:20261121
base=/opt/hollowgate/aruba-source/deploy/aruba
trial=/opt/hollowgate/staging-trial
[[ ! -e $work ]] || die 'update already attempted; do not repeat'
mkdir -m 700 "$work"
for file in SHA256SUMS source-inventory.json collect-recovery-environment.mjs \
  compare-recovery-environments.mjs staging-campaign-compose.py \
  assemble-staging-campaign-sql.py 037_staging_database_role.sql; do
  [[ -f $source/$file && ! -L $source/$file ]] || die 'input missing or symlink'
  install -o root -g root -m 600 "$source/$file" "$work/$file"
done
[[ $(sha256sum "$work/SHA256SUMS" | head -c 64) == "$1" ]] || die 'manifest mismatch'
(cd "$work" && sha256sum --status -c SHA256SUMS) || die 'immutable inputs changed'
[[ -s $rehearsal/staging.dump && -s $rehearsal/clone-plan.sql ]] || die 'successful clone rehearsal files missing'
[[ $(sha256sum "$rehearsal/SHA256SUMS" | head -c 64) == dbfdfd4ea91ca7a97d436cf9dd38c75d0414f6cedfbdea3e502bdab9b0d694f0 ]] ||
  die 'unexpected clone rehearsal bundle'
(cd "$rehearsal" && sha256sum --status -c SHA256SUMS) || die 'rehearsed source files changed'
phase=preflight
api_mutated=0
trap 'status=$?; echo "STAGING_RECOVERY_ERROR: phase=$phase line=$LINENO exit=$status" >&2' ERR
api=$(docker ps --filter label=com.docker.compose.project="$project" \
  --filter label=com.docker.compose.service="$service" --format '{{.ID}}')
[[ -n $api && $api != *$'\n'* ]] || die 'expected one staging API'
collector=$(cat "$work/collect-recovery-environment.mjs")
snapshot(){
  docker exec -i "$1" node --input-type=module -e "$collector" -- --recovery-eval staging \
    < "$work/source-inventory.json" > "$2"
}
snapshot "$api" "$work/staging-before.json"
[[ $(sha256sum "$work/staging-before.json" | head -c 64) == eaf7baef48fb1f7b7e92d0eecf5011bbf27e0548cb7ef7689ee74e3ea23df85c ]] ||
  die 'staging catalog/flags changed; old plan cannot be applied'
old_image=$(docker inspect --format '{{.Image}}' "$api")
production=hollowgate-production-private-aruba-api-1
production_image=$(docker inspect --format '{{.Image}}' "$production")
public_ready(){ [[ $(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]]; }
public_ready || die 'public readiness failed before staging update'
files=(-p "$project"
  -f "$base/compose.auth-staging.yaml" -f "$base/compose.auth-trial.yaml"
  -f "$base/compose.campaign-trial.yaml" -f "$base/compose.character-trial.yaml"
  -f "$trial/compose.staging-db-role.yaml" -f "$trial/compose.staging-api-source.yaml"
  -f "$trial/compose.oauth-trial.yaml")
[[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$api") == \
  "$base/compose.auth-staging.yaml,$base/compose.auth-trial.yaml,$base/compose.campaign-trial.yaml,$base/compose.character-trial.yaml,$trial/compose.staging-db-role.yaml,$trial/compose.staging-api-source.yaml,$trial/compose.oauth-trial.yaml" ]] ||
  die 'staging Compose provenance changed'
if docker image inspect "$tag" >/dev/null 2>&1; then die 'image pin tag already exists; do not repeat'; fi
python3 "$work/staging-campaign-compose.py" prepare "$api" "$tag" "$work"
# Recover existing STAGING IDs privately for the existing interpolation only.
export HG_STAGING_GOOGLE_CLIENT_ID HG_STAGING_DISCORD_CLIENT_ID
HG_STAGING_GOOGLE_CLIENT_ID=$(docker exec "$api" node -p 'process.env.GOOGLE_OAUTH_CLIENT_ID')
HG_STAGING_DISCORD_CLIENT_ID=$(docker exec "$api" node -p 'process.env.DISCORD_OAUTH_CLIENT_ID')
unset AUTH_VTT_CAMPAIGN_INVITES_ENABLED AUTH_VTT_CAMPAIGN_ROSTER_ENABLED \
  AUTH_VTT_CHARACTER_AVAILABILITY_ENABLED AUTH_VTT_CHARACTER_ASSIGNMENTS_ENABLED AUTH_VTT_PLAYER_CHARACTERS_ENABLED
for mode in on off; do
  docker compose "${files[@]}" -f "$work/compose.campaign-$mode.json" config --quiet
  docker compose "${files[@]}" -f "$work/compose.campaign-$mode.json" config --format json > "$work/config-$mode.private.json"
  python3 "$work/staging-campaign-compose.py" validate "$work/runtime-before.private.json" \
    "$work/config-$mode.private.json" "$mode" "$tag"
done
docker tag "$old_image" "$tag"
[[ $(docker image inspect --format '{{.Id}}' "$tag") == "$old_image" ]] || die 'image pin failed'
# Reassemble the exact rehearsed eight files; compare bodies before any DDL.
python3 "$work/assemble-staging-campaign-sql.py" "$rehearsal" > "$work/plan-body.sql"
cmp -s "$work/plan-body.sql" "$rehearsal/plan-body.sql" || die 'SQL plan differs from clone rehearsal'
{
  printf "SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';\n"
  printf "DO \$\$ BEGIN IF current_database() <> '%s' THEN RAISE EXCEPTION 'Wrong staging DB'; END IF; END \$\$;\n" "$db"
  cat "$work/plan-body.sql" "$work/037_staging_database_role.sql"
} > "$work/staging-plan.sql"

phase=fresh-backup
docker exec "$pg" pg_dump -Fc --lock-wait-timeout=5s -U hollowgate -d "$db" > "$work/staging-before.dump"
[[ -s $work/staging-before.dump ]] || die 'fresh staging backup empty'
docker exec -i "$pg" pg_restore --list < "$work/staging-before.dump" > /dev/null || die 'fresh staging archive unreadable'
echo 'STAGING_RECOVERY_PREFLIGHT_AND_BACKUP_OK'
phase=sql-transaction
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 --single-transaction -U hollowgate -d "$db" -f - \
  < "$work/staging-plan.sql" > "$work/sql.private.log" 2>&1 || die 'staging SQL failed; transaction aborted, API unchanged'
echo 'STAGING_RECOVERY_SQL_AND_037_OK'

wait_ready(){
  local container=$1 attempt
  for ((attempt=1;attempt<=15;attempt++)); do
    [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]] || return 1
    if docker exec "$container" node -e "fetch('http://127.0.0.1:3000/ready',{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then return 0; fi
    sleep 1
  done
  return 1
}
find_api(){ docker ps --filter label=com.docker.compose.project="$project" --filter label=com.docker.compose.service="$service" --format '{{.ID}}'; }
on_exit(){
  local status=$1
  trap - EXIT
  if (( status == 0 || api_mutated == 0 )); then return; fi
  echo 'STAGING_RECOVERY_API_FAILED — restoring previous staging flags; SQL retained' >&2
  if docker compose "${files[@]}" -f "$work/compose.campaign-off.json" up -d --no-deps --no-build --force-recreate "$service" \
      >> "$work/api.private.log" 2>&1; then
    local restored
    restored=$(find_api)
    if [[ -n $restored && $restored != *$'\n'* && $(docker inspect --format '{{.Image}}' "$restored") == "$old_image" ]] && wait_ready "$restored"; then
      echo 'STAGING_RECOVERY_ROLLBACK_OK — prior API flags restored; users preserved' >&2
      return
    fi
  fi
  echo 'STAGING_RECOVERY_ROLLBACK_INCOMPLETE — inspect private logs; do not repeat' >&2
}
trap 'on_exit $?' EXIT
trap 'exit 1' HUP INT TERM
phase=staging-api-recreation
api_mutated=1
docker compose "${files[@]}" -f "$work/compose.campaign-on.json" up -d --no-deps --no-build --force-recreate "$service" \
  > "$work/api.private.log" 2>&1
api=$(find_api)
[[ -n $api && $api != *$'\n'* && $(docker inspect --format '{{.Image}}' "$api") == "$old_image" ]] || die 'staging runtime/image mismatch'
wait_ready "$api" || die 'staging API not ready'
snapshot "$api" "$work/staging-after.json"
compare=$(cat "$work/compare-recovery-environments.mjs")
compare+=$'\nlet input="";for await(const chunk of process.stdin){input+=chunk;if(input.length>4000000)throw Error("Snapshot too large");}\nconst result=assessCampaignPlayer(JSON.parse(input));process.stdout.write(JSON.stringify(result,null,2)+"\\n");if(result.blockers.length)process.exitCode=1;'
docker exec -i "$api" node --input-type=module -e "$compare" < "$work/staging-after.json" \
  > "$work/assessment.json" || die 'post-update schema/grant/flag gate failed'
docker exec hollowgate-staging-edge-caddy-1 sh -c 'wget -q -O /dev/null http://aruba-auth-staging:3000/ready' || die 'Caddy cannot reach staging API'
public_ready || die 'production readiness changed during staging operation'
[[ $(docker inspect --format '{{.Image}}' "$production") == "$production_image" ]] || die 'production image changed independently; stop'
phase=complete
echo 'STAGING_CAMPAIGN_RECOVERY_OK — same image/OAuth; five flags enabled; production unchanged; browser QA required'
