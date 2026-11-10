#!/usr/bin/env bash
# Verify the actual chat RLS proposal's implications for public dice rolls and reactions.
# Requires chat-policy-smoke-test.sh to have set up disposable PostgreSQL.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
[[ "${STAGING_CONFIRM:-}" == LOCAL_ONLY && "$#" == 0 ]] || { echo 'REFUSED: local disposable database only' >&2; exit 2; }
compose=(docker compose -f infra/staging/docker-compose.yml)
"${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE public.chat_messages
  ADD COLUMN kind text NOT NULL DEFAULT 'message',
  ADD COLUMN payload jsonb,
  ADD COLUMN reactions jsonb;
SQL
PLAYER_A=00000000-0000-4000-8000-000000000003
PLAYER_B=00000000-0000-4000-8000-000000000004
OUTSIDER=00000000-0000-4000-8000-000000000005
CAMP_A=00000000-0000-4000-8000-0000000000a1
ROLL_ID=20000000-0000-4000-8000-000000000001
query_as() {
  local actor="$1" statement="$2"
  "${compose[@]}" exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test <<SQL | sed '1d'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','$actor',true);
$statement
ROLLBACK;
SQL
}
# Public roll: owner may persist their own event with the verified sender_id.
query_as "$PLAYER_A" "INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content,kind,payload) VALUES ('$ROLL_ID','$CAMP_A','$PLAYER_A','Player A','1d20','roll','{\"visibility\":\"public\"}');" >/dev/null
# A client receiving a roll must NOT forge sender_id of its author merely
# to persist the event; rejected writes must remain denied.
assert_rejected() {
  local label="$1" actor="$2" stmt="$3"
  if query_as "$actor" "$stmt" >/dev/null 2>&1; then
    echo "FAIL: $label unexpectedly authorized" >&2; exit 1
  fi
}
assert_rejected delegated_public_roll "$PLAYER_B" "INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content,kind) VALUES ('$ROLL_ID','$CAMP_A','$PLAYER_A','Player A','1d20','roll');"
assert_rejected outsider_public_roll "$OUTSIDER" "INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content,kind) VALUES ('$ROLL_ID','$CAMP_A','$OUTSIDER','Outsider','1d20','roll');"
# Reactions: the proposed RLS intentionally denies all client UPDATEs.
# Returning no rows is acceptable; updating content is also forbidden.
changed="$(query_as "$PLAYER_A" "INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content) VALUES ('20000000-0000-4000-8000-000000000002','$CAMP_A','$PLAYER_A','Player A','text'); UPDATE public.chat_messages SET reactions='[{\"char\":\"👍\"}]'::jsonb WHERE id='20000000-0000-4000-8000-000000000002' RETURNING id;" | grep -c '^20000000-0000-4000-8000-000000000002$' || true)"
[[ "$changed" == 0 ]] || { echo 'FAIL: unrestricted reaction UPDATE unexpectedly authorized' >&2; exit 1; }
changed="$(query_as "$PLAYER_A" "INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content) VALUES ('20000000-0000-4000-8000-000000000003','$CAMP_A','$PLAYER_A','Player A','text'); UPDATE public.chat_messages SET content='tampered' WHERE id='20000000-0000-4000-8000-000000000003' RETURNING id;" | grep -c '^20000000-0000-4000-8000-000000000003$' || true)"
[[ "$changed" == 0 ]] || { echo 'FAIL: unrestricted content UPDATE unexpectedly authorized' >&2; exit 1; }
echo 'PASS: public-roll ownership enforced; reaction/content UPDATE denied as designed'
