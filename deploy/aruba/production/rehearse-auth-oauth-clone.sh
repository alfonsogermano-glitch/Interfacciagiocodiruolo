#!/usr/bin/env bash
# Production READ-ONLY backup + disposable clone; 036 and its regression run
# ONLY on the clone. NEVER apply SQL or feature flags to the live database.
set -Eeuo pipefail
umask 077
die(){ echo "AUTH_CLONE_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run via sudo only after reviewing bundle'
[[ $# == 2 && $1 == /home/hgadmin/hg-auth-oauth-clone-qa-20261121 &&
   $2 =~ ^[a-f0-9]{64}$ ]] || die 'expected reviewed bundle path and manifest SHA-256'
bundle=$1
[[ $(sha256sum "$bundle/SHA256SUMS" | cut -d' ' -f1) == "$2" ]] || die 'manifest hash mismatch'
(cd "$bundle" && sha256sum --status -c SHA256SUMS) || die 'bundle hash mismatch'
db=hollowgate
clone=hollowgate_auth_release_verify_20261121
pg=hollowgate-postgres-1
api=hollowgate-production-private-aruba-api-1
backup=/opt/hollowgate-auth-release-qa-20261121
[[ ! -e $backup ]] || die 'backup path already exists; do not repeat'
[[ $(docker exec "$api" node -p 'process.env.PGDATABASE') == "$db" &&
   $(docker exec "$api" node -p 'process.env.PGUSER') == hollowgate_auth_app &&
   $(docker exec "$api" node -p 'process.env.AUTH_OAUTH_ENABLED') == false &&
   $(docker exec "$api" node -p 'process.env.AUTH_SIGNUP_ENABLED') == false ]] ||
  die 'public API runtime/flags unexpected'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] ||
  die 'public API not healthy'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) == 404 ]] ||
  die 'signup already exposed'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' ||
  die 'OAuth providers unexpectedly active'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d postgres \
  -c "SELECT count(*) FROM pg_database WHERE datname='$clone'") == 0 ]] ||
  die 'clone already exists; do not repeat'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hollowgate_auth' AND c.relname IN ('oauth_identities','oauth_attempts')") == 0 ]] ||
  die 'production OAuth schema unexpectedly present; stop'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='hollowgate_auth' AND p.proname IN ('begin_oauth','consume_oauth','finish_oauth')") == 0 ]] ||
  die 'production OAuth functions already present; stop'
[[ $(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" \
  -c "SELECT count(*) FROM hollowgate_auth.users WHERE email='new@example.invalid'") == 0 ]] ||
  die 'clone test fixture conflicts with an existing user; stop'

mkdir -m 700 "$backup"
docker exec "$pg" pg_dump -Fc -U hollowgate -d "$db" > "$backup/production.dump"
[[ -s $backup/production.dump ]] || die 'production backup empty'
docker exec "$pg" createdb -U hollowgate -T template0 "$clone"
docker exec -i "$pg" pg_restore --exit-on-error --no-owner -U hollowgate -d "$clone" \
  < "$backup/production.dump" > /dev/null
counts="SELECT (SELECT count(*) FROM hollowgate_auth.users),(SELECT count(*) FROM hollowgate_vtt.campaigns),(SELECT count(*) FROM hollowgate_vtt.visual_assets)"
live=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$db" -c "$counts")
restored=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -c "$counts")
[[ $live == "$restored" ]] || die 'restored data counts differ; production unchanged'
echo 'AUTH_PRODUCTION_BACKUP_AND_RESTORE_OK'

docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -f - \
  < "$bundle/036_auth_oauth_identities.sql" > /dev/null ||
  die '036 failed on clone; production unchanged'
docker exec -i "$pg" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -f - \
  < "$bundle/test_auth_oauth.sql" > /dev/null ||
  die 'OAuth SQL regression failed on clone; production unchanged'
grants=$(docker exec "$pg" psql -X -At -v ON_ERROR_STOP=1 -U hollowgate -d "$clone" -c "SELECT
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.begin_oauth(bytea,bytea,text,text,text,uuid,bytea)','EXECUTE'),
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.consume_oauth(bytea,bytea,text)','EXECUTE'),
  has_function_privilege('hollowgate_auth_app','hollowgate_auth.finish_oauth(text,text,text,text,uuid)','EXECUTE'),
  has_table_privilege('hollowgate_auth_app','hollowgate_auth.oauth_identities','INSERT')")
[[ $grants == 't|t|t|f' ]] || die 'restricted runtime grants missing on clone'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]] ||
  die 'production health changed during clone rehearsal'
echo "AUTH_OAUTH_CLONE_SQL_OK — production data untouched; counts $live"
