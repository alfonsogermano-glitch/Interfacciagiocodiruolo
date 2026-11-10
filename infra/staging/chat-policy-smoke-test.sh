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
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_messages TO authenticated;
-- Exercise the chat proposal together with the deployed membership read model.
-- These fixture policies mirror observed production SELECT semantics; they are
-- not an export or a replacement for the complete production RLS policies.
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_select_own ON public.campaigns FOR SELECT TO authenticated
 USING (owner_profile_id = (SELECT auth.uid())::text);
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_members_select_if_member_or_owner
 ON public.campaign_members FOR SELECT TO authenticated
 USING (
   profile_id = (SELECT auth.uid())::text
   OR EXISTS (
     SELECT 1 FROM public.campaigns c
     WHERE c.id=campaign_members.campaign_id
       AND c.owner_profile_id=(SELECT auth.uid())::text
   )
 );
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
# Reproduce only the deployed delete rule in the isolated fixture;
# the SELECT/INSERT/UPDATE proposal remains unchanged.
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U hollowgate_test -d hollowgate_test <<'SQL'
CREATE POLICY chat_messages_delete ON public.chat_messages FOR DELETE TO authenticated
 USING (
   sender_id=(SELECT auth.uid())::text
   OR EXISTS (
     SELECT 1 FROM public.campaigns c
     WHERE c.id=chat_messages.campaign_id
       AND c.owner_profile_id=(SELECT auth.uid())::text
   )
 );
SQL
# A GM may see their own campaign but must not see the other GM's.
assert_visible() {
  local result
  result="$(query_as "$1" "$2" | tail -n 1)"
  [[ "$result" == "$3" ]] || { echo "FAIL: $4 visibility expected $3 got $result" >&2; exit 1; }
}
assert_visible "$GM_A" "SELECT count(*) FROM public.campaigns;" 1 "GM campaign"
assert_visible "$GM_A" "SELECT count(*) FROM public.campaign_members;" 1 "GM membership"
assert_visible "$PLAYER_A" "SELECT count(*) FROM public.campaigns;" 0 "player campaigns"
assert_visible "$PLAYER_A" "SELECT count(*) FROM public.campaign_members;" 1 "player membership"
assert_visible "$OUTSIDER" "SELECT count(*) FROM public.campaigns;" 0 "outsider campaigns"
assert_visible "$OUTSIDER" "SELECT count(*) FROM public.campaign_members;" 0 "outsider memberships"
# In absence of INSERT and UPDATE membership policies, players cannot add themselves.
assert_denied forge_membership "$OUTSIDER" "INSERT INTO public.campaign_members VALUES ('00000000-0000-4000-8000-0000000000a1','$OUTSIDER');"
# DELETE returns zero rows when the authenticated user is neither the sender
# nor the campaign owner. Use RETURNING rather than treating zero as SQL failure.
assert_delete_count() {
  local actual
  actual="$(query_as "$1" "DELETE FROM public.chat_messages WHERE id='$2' RETURNING id;" | grep -c '^10000000-' || true)"
  [[ "$actual" == "$3" ]] || { echo "FAIL: $4 deleted $actual rows, expected $3" >&2; exit 1; }
}
assert_delete_count "$PLAYER_A" 10000000-0000-4000-8000-000000000001 0 "player cannot delete GM's post"
assert_delete_count "$PLAYER_B" 10000000-0000-4000-8000-000000000001 0 "other campaign cannot delete"
assert_delete_count "$OUTSIDER" 10000000-0000-4000-8000-000000000001 0 "outsider cannot delete"
assert_delete_count "$GM_A" 10000000-0000-4000-8000-000000000001 1 "GM deletes own post"
assert_delete_count "$GM_A" 10000000-0000-4000-8000-000000000002 0 "GM cannot delete other campaign"
# An author's delete is also allowed when the message belongs to their campaign.
# A real player message is inserted within the same transaction for this assertion.
author_delete="$(query_as "$PLAYER_A" "INSERT INTO public.chat_messages VALUES ('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-0000000000a1','$PLAYER_A','player A','test'); DELETE FROM public.chat_messages WHERE id='10000000-0000-4000-8000-000000000007' RETURNING id;" | grep -c '^10000000-0000-4000-8000-000000000007$' || true)"
[[ "$author_delete" == 1 ]] || { echo "FAIL: author deletion did not work" >&2; exit 1; }

# With SQL UPDATE privilege but no RLS UPDATE policy, no row may be returned.
changed="$(query_as "$PLAYER_A" "UPDATE public.chat_messages SET content='tampered' WHERE campaign_id='00000000-0000-4000-8000-0000000000a1' RETURNING id;" | tail -n 1)"
[[ "$changed" == "" ]] || { echo "FAIL: UPDATE returned a row: $changed" >&2; exit 1; }
echo 'PASS: campaign/member RLS and chat policy/delete matrix on isolated PostgreSQL 17'
