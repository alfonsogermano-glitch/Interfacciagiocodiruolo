#!/usr/bin/env bash
# One-time *approved* production preparation: private production-only OAuth
# clients and additive SQL 036. NO container recreation, Caddy or feature flag.
set -Eeuo pipefail
umask 077
die(){ echo "AUTH_FOUNDATION_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run with sudo only after exact production authorization'
[[ $# == 0 && -t 0 ]] || die 'interactive VPS terminal required; no credentials in arguments'
pg=hollowgate-postgres-1
api=hollowgate-production-private-aruba-api-1
db=hollowgate
clone=hollowgate_auth_release_verify_20261121
backup=/opt/hollowgate-auth-release-qa-20261121/production.dump
auth_bundle=/home/hgadmin/hg-auth-public-release-20261121
sql_bundle=/home/hgadmin/hg-auth-oauth-clone-qa-20261121
installer=/opt/hollowgate-configure-production-oauth-20261121.sh
[[ ! -e $installer && ! -e /opt/hollowgate-production-oauth ]] ||
  die 'production client provisioning already attempted; do not repeat'
[[ -s $backup && $(stat -c %u:%a /opt/hollowgate-auth-release-qa-20261121) == 0:700 ]] ||
  die 'verified production backup not found'
[[ $(sha256sum "$sql_bundle/SHA256SUMS" | head -c 64) == 64c1e8a60457efb5c73eb0e6ff84a6f058f29b7f3a078b8ea374e38a11414467 ]] ||
  die 'SQL rehearsal manifest changed'
(cd "$sql_bundle" && sha256sum --status -c SHA256SUMS) || die 'SQL source changed since clone rehearsal'
[[ $(sha256sum "$auth_bundle/configure-production-oauth.sh" | head -c 64) == db484bcf3bbe3ca290792f6d31fe1716b623957e1c057c7670dd5b17274e086f ]] ||
  die 'private client installer changed'
[[ $(docker exec "$api" node -p 'process.env.PGDATABASE') == "$db" &&
   $(docker exec "$api" node -p 'process.env.PGUSER') == hollowgate_auth_app &&
   $(docker exec "$api" node -p 'process.env.AUTH_OAUTH_ENABLED') == false &&
   $(docker exec "$api" node -p 'process.env.AUTH_SIGNUP_ENABLED') == false &&
   $(docker exec "$api" node -p 'process.env.AUTH_ORIGIN') == https://www.hollowgate.quest ]] ||
  die 'unexpected public API runtime'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hollowgate_auth' AND c.relname IN ('oauth_identities','oauth_attempts')") == 0 ]] ||
  die 'OAuth SQL already applied; do not repeat'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hollowgate_auth' AND c.relname IN ('oauth_identities','oauth_attempts')") == 2 ]] ||
  die 'OAuth SQL clone rehearsal missing'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 &&
   $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) == 404 ]] ||
  die 'public site not in expected state'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' ||
  die 'public OAuth already active'

install -o root -g root -m 700 "$auth_bundle/configure-production-oauth.sh" "$installer"
"$installer"
# The migration itself has BEGIN/COMMIT and is additive. On error, the DB
# transaction aborts; existing production rows are NEVER restored from a dump.
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -f - \
  < "$sql_bundle/036_auth_oauth_identities.sql" > /dev/null ||
  die '036 production migration failed; public OAuth remains OFF'
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -f - \
  < "$sql_bundle/test_auth_oauth.sql" > /dev/null ||
  die 'production OAuth SQL regression failed; public OAuth remains OFF'
grants=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -c "SELECT
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.begin_oauth(bytea,bytea,text,text,text,uuid,bytea)','EXECUTE'),
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.consume_oauth(bytea,bytea,text)','EXECUTE'),
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.finish_oauth(text,text,text,text,uuid)','EXECUTE'),
  has_table_privilege('hollowgate_auth_app','hollowgate_auth.oauth_identities','INSERT')")
[[ $grants == 't|t|t|f' ]] || die 'runtime OAuth grants unexpected; public OAuth remains OFF'
echo 'AUTH_PRODUCTION_SCHEMA_036_OK'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 &&
   $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) == 404 ]] ||
  die 'public readiness/route unexpected after SQL; no feature flag enabled'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' ||
  die 'public provider list unexpected; no feature flag enabled'
echo 'PUBLIC_AUTH_STILL_OFF — no API/Caddy restart or public signup'
