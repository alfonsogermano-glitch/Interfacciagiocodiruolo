#!/usr/bin/env bash
# Fresh staging backup/restore + eight SQL migrations/tests on CLONE ONLY.
# No staging/production API changes, flags, Caddy, 037 execution or DB restore
# over either active DB. Run once via sudo after bundle hash verification.
set -Eeuo pipefail
umask 077
die(){ echo "CAMPAIGN_CLONE_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'requires approved sudo session'
[[ $# == 1 && $1 =~ ^[a-f0-9]{64}$ ]] || die 'expected reviewed manifest digest'
source=/home/hgadmin/hg-campaign-clone-recovery-20261121
work=/opt/hollowgate-campaign-clone-recovery-20261121
db=hollowgate_auth_test
clone=hollowgate_stage_campaign_verify_20261121
pg=hollowgate-postgres-1
[[ ! -e $work ]] || die 'rehearsal already attempted; do not repeat'
mkdir -m 700 "$work"
for file in SHA256SUMS source-inventory.json collect-recovery-environment.mjs \
  assemble-staging-campaign-sql.py sync-staging-campaign-clone-grants.sql \
  test-staging-campaign-clone-runtime.sql \
  015_vtt_campaign_notes.sql 016_vtt_campaign_members.sql \
  026_vtt_campaign_roster.sql 027_vtt_character_availability.sql \
  028_vtt_character_player_assignments.sql 029_vtt_player_character_read.sql \
  030_vtt_joined_player_campaigns.sql 033_vtt_campaign_invites.sql \
  test_vtt_campaign_members.sql test_vtt_joined_player_campaigns.sql test_vtt_campaign_invites.sql; do
  [[ -f $source/$file && ! -L $source/$file ]] || die 'reviewed input missing or symlink'
  install -o root -g root -m 600 "$source/$file" "$work/$file"
done
[[ $(sha256sum "$work/SHA256SUMS" | head -c 64) == "$1" ]] || die 'manifest digest mismatch'
(cd "$work" && sha256sum --status -c SHA256SUMS) || die 'immutable input hash mismatch'
stage=preflight
trap 'code=$?; echo "CAMPAIGN_CLONE_ERROR: phase=$stage line=$LINENO exit=$code; active databases unchanged" >&2' ERR
api=$(docker ps --filter label=com.docker.compose.project=hollowgate-auth-staging \
  --filter label=com.docker.compose.service=aruba-auth-staging --format '{{.ID}}')
[[ -n $api && $api != *$'\n'* ]] || die 'expected one staging API'
collector=$(cat "$work/collect-recovery-environment.mjs")
docker exec -i "$api" node --input-type=module -e "$collector" -- --recovery-eval staging \
  < "$work/source-inventory.json" > "$work/staging-before.json"
[[ $(sha256sum "$work/staging-before.json" | head -c 64) == eaf7baef48fb1f7b7e92d0eecf5011bbf27e0548cb7ef7689ee74e3ea23df85c ]] ||
  die 'staging catalog/flags changed since audited snapshot; do not apply old plan'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname='$clone'") == 0 ]] || die 'clone exists; do not repeat'
[[ $(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] || die 'public readiness not 200'
# Validate source wrappers and produce the exact plan BEFORE taking a dump.
python3 "$work/assemble-staging-campaign-sql.py" "$work" > "$work/plan-body.sql"
{
  printf "DO \$\$ BEGIN IF current_database() <> '%s' THEN RAISE EXCEPTION 'Wrong clone'; END IF; END \$\$;\n" "$clone"
  cat "$work/plan-body.sql" "$work/sync-staging-campaign-clone-grants.sql"
} > "$work/clone-plan.sql"

stage=backup-restore
counts_sql='SELECT (SELECT count(*) FROM hollowgate_auth.users),(SELECT count(*) FROM hollowgate_vtt.campaigns),(SELECT count(*) FROM hollowgate_vtt.character_drafts),(SELECT count(*) FROM hollowgate_auth.oauth_identities)'
before=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -c "$counts_sql")
docker exec "$pg" pg_dump -Fc -U hollowgate -d "$db" > "$work/staging.dump"
[[ -s $work/staging.dump ]] || die 'staging backup empty'
docker exec "$pg" createdb -U hollowgate -T template0 "$clone"
docker exec -i "$pg" pg_restore --exit-on-error --no-owner -U hollowgate -d "$clone" \
  < "$work/staging.dump" > "$work/restore.log" 2>&1 || die 'clone restore failed; private log retained'
restored=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -c "$counts_sql")
[[ $before == "$restored" ]] || die 'restore counts differ (concurrent staging changes possible); active DB unchanged'
echo 'CAMPAIGN_CLONE_BACKUP_RESTORE_OK'

stage=clone-migrations
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 --single-transaction -U hollowgate -d "$clone" -f - \
  < "$work/clone-plan.sql" > "$work/migrations.log" 2>&1 || die 'clone SQL plan failed; active DB unchanged, private log retained'
echo 'CAMPAIGN_CLONE_EIGHT_MIGRATIONS_OK'
stage=clone-regressions
for file in test_vtt_campaign_members.sql test_vtt_joined_player_campaigns.sql \
  test_vtt_campaign_invites.sql test-staging-campaign-clone-runtime.sql; do
  docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -f - \
    < "$work/$file" > "$work/$file.log" 2>&1 || die "clone regression failed: $file; active DB unchanged"
done
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -c "$counts_sql") == "$restored" ]] ||
  die 'clone QA changed user/campaign/character/social counts; do not promote'
echo 'CAMPAIGN_CLONE_INVITE_PLAYER_AND_RUNTIME_OK'
stage=active-environments-readonly-check
docker exec -i "$api" node --input-type=module -e "$collector" -- --recovery-eval staging \
  < "$work/source-inventory.json" > "$work/staging-after.json"
cmp -s "$work/staging-before.json" "$work/staging-after.json" || die 'active staging metadata changed during rehearsal'
[[ $(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] || die 'public readiness changed'
stage=complete
echo 'CAMPAIGN_CLONE_REHEARSAL_OK — active staging/production untouched; no flags or APIs changed'
