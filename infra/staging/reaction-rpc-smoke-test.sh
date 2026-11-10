#!/usr/bin/env bash
# Runs after roll-reaction-smoke-test.sh in disposable PostgreSQL CI only.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
[[ "${STAGING_CONFIRM:-}" == LOCAL_ONLY && "$#" == 0 ]] || { echo 'REFUSED: isolated local test only' >&2; exit 2; }
compose=(docker compose -f infra/staging/docker-compose.yml)
"${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN NOBYPASSRLS;
ALTER TABLE public.campaigns ADD COLUMN deleted_at timestamptz;
CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text NOT NULL);
INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001','GM A'),
 ('00000000-0000-4000-8000-000000000002','GM B'),
 ('00000000-0000-4000-8000-000000000003','Player A'),
 ('00000000-0000-4000-8000-000000000004','Player B'),
 ('00000000-0000-4000-8000-000000000005','Outsider');
-- Existing policies allow SELECT/INSERT but deliberately deny direct UPDATE.
INSERT INTO public.chat_messages (id,campaign_id,sender_id,sender_name,content)
VALUES ('30000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000a1',
        '00000000-0000-4000-8000-000000000001','GM A','reactions fixture');
SQL
"${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 < docs/security/proposals/chat_reaction_rpc_staging_only.sql
GM_A=00000000-0000-4000-8000-000000000001
PLAYER_A=00000000-0000-4000-8000-000000000003
PLAYER_B=00000000-0000-4000-8000-000000000004
OUTSIDER=00000000-0000-4000-8000-000000000005
MSG=30000000-0000-4000-8000-000000000001
call_as() {
  local actor="$1" statement="$2" role="${3:-authenticated}"
  "${compose[@]}" exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test <<SQL | sed '1d'
BEGIN;
SET LOCAL ROLE $role;
SELECT set_config('request.jwt.claim.sub','$actor',true);
$statement
ROLLBACK;
SQL
}
expect_denied() {
  if call_as "$2" "$3" "${4:-authenticated}" >/dev/null 2>&1; then
    echo "FAIL: $1 unexpectedly authorized" >&2; exit 1
  fi
}
# We need to keep changes between transactions for toggle/add/remove tests:
persist_as() {
  local actor="$1" statement="$2"
  "${compose[@]}" exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test <<SQL | sed '1d'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','$actor',true);
$statement
COMMIT;
SQL
}
# Participant toggles an emoji and the database assigns their trusted name.
result="$(persist_as "$PLAYER_A" "SELECT public.chat_toggle_reaction('$MSG','👍');" | tail -n 1)"
[[ "$result" == *'"userName": "Player A"'* && "$result" == *'"userId": "00000000-0000-4000-8000-000000000003"'* ]] || { echo 'FAIL: trusted owner/name missing' >&2; exit 1; }
# Different participant keeps the first reaction and adds their own.
result="$(persist_as "$GM_A" "SELECT public.chat_toggle_reaction('$MSG','🔥');" | tail -n 1)"
[[ "$result" == *'Player A'* && "$result" == *'GM A'* ]] || { echo 'FAIL: multi-user reactions overwritten' >&2; exit 1; }
# Same emoji removes just the actor's reaction.
result="$(persist_as "$PLAYER_A" "SELECT public.chat_toggle_reaction('$MSG','👍');" | tail -n 1)"
[[ "$result" != *'Player A'* && "$result" == *'GM A'* ]] || { echo 'FAIL: toggle did not preserve other reaction' >&2; exit 1; }
expect_denied outsider "$OUTSIDER" "SELECT public.chat_toggle_reaction('$MSG','💀');"
expect_denied different_campaign "$PLAYER_B" "SELECT public.chat_toggle_reaction('$MSG','🎲');"
expect_denied oversized_char "$PLAYER_A" "SELECT public.chat_toggle_reaction('$MSG',repeat('a',17));"
expect_denied unauthenticated "$OUTSIDER" "SELECT public.chat_toggle_reaction('$MSG','💀');" anon
expect_denied no_identity "" "SELECT public.chat_toggle_reaction('$MSG','💀');"
# A direct SQL UPDATE remains denied even after RPC has been installed.
affected="$(call_as "$PLAYER_A" "UPDATE public.chat_messages SET content='tampered' WHERE id='$MSG' RETURNING id;" | grep -c "^$MSG$" || true)"
[[ "$affected" == 0 ]] || { echo 'FAIL: raw message update authorized' >&2; exit 1; }
echo 'PASS: isolated reaction RPC enforces membership, identity, atomic toggle and no raw UPDATE'
