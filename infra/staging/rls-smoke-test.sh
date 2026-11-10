#!/usr/bin/env bash
# Live PostgreSQL RLS test using synthetic GM/player/outsider identities only.
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
[[ "${STAGING_CONFIRM:-}" == "LOCAL_ONLY" ]] || { echo 'REFUSED: set STAGING_CONFIRM=LOCAL_ONLY' >&2; exit 2; }
compose=(docker compose -f infra/staging/docker-compose.yml)
# The PostgreSQL fixture is disposable and never reachable from a published port.
"${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE hollowgate_rls_actor NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE TABLE public.hollowgate_fixture_campaign (
  id text PRIMARY KEY, gm text NOT NULL
);
CREATE TABLE public.hollowgate_fixture_member (
  campaign_id text NOT NULL REFERENCES public.hollowgate_fixture_campaign(id),
  person text NOT NULL,
  PRIMARY KEY(campaign_id, person)
);
CREATE TABLE public.hollowgate_fixture_message (
  id integer PRIMARY KEY, campaign_id text NOT NULL REFERENCES public.hollowgate_fixture_campaign(id),
  sender text NOT NULL, body text NOT NULL
);
INSERT INTO public.hollowgate_fixture_campaign VALUES ('a','gm_a'),('b','gm_b');
INSERT INTO public.hollowgate_fixture_member VALUES ('a','player_a'),('b','player_b');
INSERT INTO public.hollowgate_fixture_message VALUES (1,'a','gm_a','private a'),(2,'b','gm_b','private b');
GRANT USAGE ON SCHEMA public TO hollowgate_rls_actor;
GRANT SELECT ON public.hollowgate_fixture_campaign,public.hollowgate_fixture_member TO hollowgate_rls_actor;
GRANT SELECT, INSERT ON public.hollowgate_fixture_message TO hollowgate_rls_actor;
ALTER TABLE public.hollowgate_fixture_message ENABLE ROW LEVEL SECURITY;
CREATE POLICY synthetic_member_select ON public.hollowgate_fixture_message FOR SELECT TO hollowgate_rls_actor
 USING (
  EXISTS (SELECT 1 FROM public.hollowgate_fixture_campaign c
    WHERE c.id=campaign_id AND c.gm=current_setting('app.fixture_user', true))
  OR EXISTS (SELECT 1 FROM public.hollowgate_fixture_member m
    WHERE m.campaign_id=campaign_id AND m.person=current_setting('app.fixture_user', true))
 );
CREATE POLICY synthetic_member_insert ON public.hollowgate_fixture_message FOR INSERT TO hollowgate_rls_actor
 WITH CHECK (
   sender=current_setting('app.fixture_user', true) AND
   (EXISTS (SELECT 1 FROM public.hollowgate_fixture_campaign c
     WHERE c.id=campaign_id AND c.gm=current_setting('app.fixture_user', true))
    OR EXISTS (SELECT 1 FROM public.hollowgate_fixture_member m
     WHERE m.campaign_id=campaign_id AND m.person=current_setting('app.fixture_user', true)))
 );
SQL
expect_count() {
  local user="$1" want="$2" got
  got="$("${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -At -v ON_ERROR_STOP=1 -c "BEGIN; SET LOCAL ROLE hollowgate_rls_actor; SELECT set_config('app.fixture_user', '$user', true); SELECT count(*) FROM public.hollowgate_fixture_message; COMMIT;" | tail -n 2 | head -n 1)"
  [[ "$got" == "$want" ]] || { echo "FAIL: $user expected $want messages, got $got" >&2; exit 1; }
}
# Each authenticated identity may read its own campaign, never the other campaign.
expect_count gm_a 1
expect_count player_a 1
expect_count gm_b 1
expect_count player_b 1
expect_count outsider 0
# An unauthorized player cannot forge a cross-campaign message.
if "${compose[@]}" exec -T postgres psql -U hollowgate_test -d hollowgate_test -v ON_ERROR_STOP=1 <<'SQL' >/dev/null 2>&1
BEGIN;
SET LOCAL ROLE hollowgate_rls_actor;
SELECT set_config('app.fixture_user', 'player_a', true);
INSERT INTO public.hollowgate_fixture_message VALUES (3,'b','player_a','forged');
COMMIT;
SQL
then
  echo 'FAIL: cross-campaign INSERT unexpectedly succeeded' >&2
  exit 1
fi
echo 'PASS: synthetic RLS hides other campaigns and rejects cross-campaign INSERT on real PostgreSQL 17'
