#!/usr/bin/env bash
set -euo pipefail

# Disposable PostgreSQL race proof. The caller must provide an explicitly named
# local/CI container; this script never accepts a host, URL or production DB.
container="${1:-}"
database="${HG_CLAIM_RACE_DATABASE:-hollowgate_test}"
[[ "$container" =~ ^hg-[a-z0-9-]+$ ]] || { echo 'Unsafe PostgreSQL container name' >&2; exit 2; }
[[ "$database" == 'hollowgate_test' ]] || { echo 'Claim race requires hollowgate_test' >&2; exit 2; }

gm='71000000-0000-4000-8000-000000000001'
player_a='71000000-0000-4000-8000-000000000002'
player_b='71000000-0000-4000-8000-000000000003'
campaign='71000000-0000-4000-8000-000000000004'
character='71000000-0000-4000-8000-000000000005'
sheet='{"style":"Jock","viaggio":"Race","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'
work="$(mktemp -d)"
reset_fixture(){
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" -q <<SQL
DELETE FROM hollowgate_vtt.character_claims WHERE character_id='$character' OR campaign_id='$campaign';
DELETE FROM hollowgate_vtt.character_player_assignments WHERE character_id='$character' OR campaign_id='$campaign';
DELETE FROM hollowgate_vtt.character_drafts WHERE id='$character';
DELETE FROM hollowgate_vtt.campaign_members WHERE campaign_id='$campaign';
DELETE FROM hollowgate_vtt.campaigns WHERE id='$campaign';
DELETE FROM hollowgate_auth.users WHERE id IN ('$gm','$player_a','$player_b');
SQL
}
cleanup(){
  reset_fixture || true
  rm -rf "$work"
}
trap cleanup EXIT
reset_fixture

docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" -q <<SQL
INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
 ('$gm','claim-race-gm@example.invalid','Race GM','active',now(),'local'),
 ('$player_a','claim-race-a@example.invalid','Race A','active',now(),'local'),
 ('$player_b','claim-race-b@example.invalid','Race B','active',now(),'local');
INSERT INTO hollowgate_vtt.campaigns(id,owner_id,name,description,ruleset) VALUES
 ('$campaign','$gm','Claim race','','hsc');
SELECT hollowgate_vtt.set_campaign_membership('$gm','$campaign','$player_a','player',true);
SELECT hollowgate_vtt.set_campaign_membership('$gm','$campaign','$player_b','player',true);
INSERT INTO hollowgate_vtt.character_drafts(id,campaign_id,owner_id,name,sheet_data,status,available_for_players)
 VALUES('$character','$campaign','$gm','Race PG','$sheet'::jsonb,'active',true);
SQL

runtime_access="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SELECT has_function_privilege('hollowgate_api_runtime','hollowgate_vtt.claim_available_character(uuid,uuid)','EXECUTE')::text||':'||has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_claims','SELECT')::text")"
[[ "$runtime_access" == 'true:false' || "$runtime_access" == 't:f' ]] || { echo "Invalid runtime privilege boundary: $runtime_access" >&2;exit 1; }

docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" \
 -c "SET ROLE hollowgate_api_runtime;SELECT coalesce(hollowgate_vtt.claim_available_character('$player_a','$character')::text,'NONE')" >"$work/a" &
pid_a=$!
docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" \
 -c "SET ROLE hollowgate_api_runtime;SELECT coalesce(hollowgate_vtt.claim_available_character('$player_b','$character')::text,'NONE')" >"$work/b" &
pid_b=$!
wait "$pid_a";wait "$pid_b"

winner_count="$(grep -hx "$campaign" "$work/a" "$work/b" | wc -l | tr -d ' ')"
loser_count="$(grep -hx 'NONE' "$work/a" "$work/b" | wc -l | tr -d ' ')"
[[ "$winner_count" == '1' && "$loser_count" == '1' ]] || {
 echo "Expected one winner and one loser, got A=$(cat "$work/a") B=$(cat "$work/b")" >&2;exit 1;
}
winner="$player_a";grep -qx "$campaign" "$work/b" && winner="$player_b"

state="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
  "SELECT count(*)||':'||min(player_id::text) FROM hollowgate_vtt.character_claims WHERE character_id='$character'")"
[[ "$state" == "1:$winner" ]] || { echo "Invalid committed claim state: $state" >&2;exit 1; }
assignment="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
  "SELECT count(*)||':'||min(player_id::text) FROM hollowgate_vtt.character_player_assignments WHERE character_id='$character'")"
[[ "$assignment" == "1:$winner" ]] || { echo "Invalid committed assignment state: $assignment" >&2;exit 1; }
released="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.release_claimed_character('$winner','$character')")"
[[ "$released" == "$character" ]] || { echo 'Winner could not release claim' >&2;exit 1; }
remaining="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SELECT (SELECT count(*) FROM hollowgate_vtt.character_claims WHERE character_id='$character')||':'||(SELECT count(*) FROM hollowgate_vtt.character_player_assignments WHERE character_id='$character')")"
[[ "$remaining" == '0:0' ]] || { echo "Release retained state: $remaining" >&2;exit 1; }

reclaimed="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.claim_available_character('$winner','$character')")"
[[ "$reclaimed" == "$campaign" ]] || { echo 'Winner could not reclaim before revocation' >&2;exit 1; }
docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.set_campaign_membership('$gm','$campaign','$winner','player',false)" >/dev/null
revoked_state="$(docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SELECT (SELECT count(*) FROM hollowgate_vtt.character_claims WHERE character_id='$character')||':'||(SELECT count(*) FROM hollowgate_vtt.character_player_assignments WHERE character_id='$character')")"
[[ "$revoked_state" == '0:0' ]] || { echo "Membership revocation retained state: $revoked_state" >&2;exit 1; }
stale_sheet="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SET ROLE hollowgate_api_runtime;SELECT coalesce(hollowgate_vtt.save_claimed_character_sheet('$winner','$campaign','$character','Stale','$sheet'::jsonb)::text,'NONE')")"
[[ "$stale_sheet" == 'NONE' ]] || { echo "Revoked player saved sheet: $stale_sheet" >&2;exit 1; }
stale_portrait="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database" -c \
 "SET ROLE hollowgate_api_runtime;SELECT hollowgate_vtt.save_authorized_character_portrait('$winner','$campaign','$character','image/png',decode('89504e470d0a1a0a00000000','hex'))")"
[[ "$stale_portrait" == 'f' || "$stale_portrait" == 'false' ]] || { echo "Revoked player saved portrait: $stale_portrait" >&2;exit 1; }
echo "CHARACTER_CLAIM_POSTGRES_RACE_PASS winner=$winner loser=$([[ "$winner" == "$player_a" ]] && echo "$player_b" || echo "$player_a") release=atomic revocation=atomic stale_writes=denied"
