#!/usr/bin/env bash
# Apply the exact Hollowgate chat RLS proposal to a disposable PostgreSQL fixture.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
[[ "${STAGING_CONFIRM:-}" == LOCAL_ONLY && "$#" == 0 ]] || { echo 'REFUSED: local-only no-argument test' >&2; exit 2; }
compose=(docker compose -f infra/staging/docker-compose.yml)
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE public.campaigns (id uuid PRIMARY KEY,owner_profile_id text NOT NULL);
CREATE TABLE public.campaign_members (
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 profile_id text NOT NULL,
 PRIMARY KEY(campaign_id,profile_id)
);
CREATE TABLE public.chat_messages (
 id uuid PRIMARY KEY,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id),
 sender_id text NOT NULL,
 sender_name text NOT NULL,
 content text NOT NULL
);
INSERT INTO public.campaigns VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000002');
INSERT INTO public.campaign_members VALUES
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000003'),
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000004');
INSERT INTO public.chat_messages VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','GM A','alpha'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-000000000002','GM B','beta');
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.campaigns,public.campaign_members TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.chat_messages TO authenticated;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
SQL
# The real SQL proposal from the branch, not recreated test-only policies.
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test < docs/security/proposals/chat_rls_staging_only.sql

GM_A=00000000-0000-4000-8000-000000000001
GM_B=00000000-0000-4000-8000-000000000002
PLAYER_A=00000000-0000-4000-8000-000000000003
PLAYER_B=00000000-0000-4000-8000-000000000004
OUTSIDER=00000000-0000-4000-8000-000000000005
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
assert_count() {
 local actual
 actual="$(query_as "$1" 'SELECT count(*) FROM public.chat_messages;' | tail -n 1)"
 [[ "$actual" == "$2" ]] || { echo "FAIL: $3 count expected $2 got $actual" >&2; exit 1; }
}
assert_count "$GM_A" 1 "GM A"
assert_count "$GM_B" 1 "GM B"
assert_count "$PLAYER_A" 1 "player A"
assert_count "$PLAYER_B" 1 "player B"
assert_count "$OUTSIDER" 0 outsider

# Legitimate player insertion succeeds (rolled back after test).
query_as "$PLAYER_A" "INSERT INTO public.chat_messages VALUES ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1','$PLAYER_A','player A','allowed');" >/dev/null
assert_denied() {
  if query_as "$2" "$3" >/dev/null 2>&1; then
    echo "FAIL: $1 unexpectedly allowed" >&2; exit 1
  fi
}
assert_denied cross_campaign "$PLAYER_A" "INSERT INTO public.chat_messages VALUES ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-0000000000b1','$PLAYER_A','player A','forged');"
assert_denied spoof_sender "$PLAYER_A" "INSERT INTO public.chat_messages VALUES ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-0000000000a1','$GM_A','GM A','forged');"
assert_denied outsider_insert "$OUTSIDER" "INSERT INTO public.chat_messages VALUES ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-0000000000a1','$OUTSIDER','outsider','forged');"
# With SQL UPDATE privilege but no RLS UPDATE policy, no row may be returned.
changed="$(query_as "$PLAYER_A" "UPDATE public.chat_messages SET content='tampered' WHERE campaign_id='00000000-0000-4000-8000-0000000000a1' RETURNING id;" | tail -n 1)"
[[ "$changed" == "" ]] || { echo "FAIL: UPDATE returned a row: $changed" >&2; exit 1; }
echo 'PASS: deployed-shape chat SQL proposal enforces cross-campaign isolation on PostgreSQL 17'
