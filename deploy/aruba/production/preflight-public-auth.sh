#!/usr/bin/env bash
# Read-only gate for the future phase-2 release. Never deploys or edits SQL.
# Install root-owned only after review. Requires a separately approved 036.
set -Eeuo pipefail
umask 077
die() { echo "AUTH_PREFLIGHT_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run via sudo'
[[ $# == 2 && $1 =~ ^[a-z0-9][a-z0-9-]{4,63}$ && $2 =~ ^[a-f0-9]{64}$ ]] ||
  die 'usage: preflight-public-auth.sh RELEASE_ID SHA256SUMS_DIGEST'
id=$1 expected=$2
bundle="/opt/hollowgate-auth-bundles/$id"
checksums="$bundle/SHA256SUMS"
caddyfile=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
web=/opt/hollowgate/aruba-source/apps/aruba-auth-web
gateway=hollowgate-staging-edge-caddy-1
api=hollowgate-production-private-aruba-api-1
base=/home/hgadmin/hollowgate-private-upload/hollowgate-aruba-production-linux
common=(-p hollowgate-production-private -f "$base/compose.private.yaml" -f "$base/compose.private-port.yaml")
overlays=(-f "$bundle/compose.core-release.yaml" -f "$bundle/compose.auth-public.yaml")

root_secure() {
  local path mode
  for path in "$@"; do
    [[ ! -L $path && $(stat -c %u "$path") == 0 ]] || die 'bundle owner or symlink'
    mode=$(stat -c %a "$path")
    (( (8#$mode & 022) == 0 )) || die 'bundle writable by non-root'
  done
}
root_secure /opt/hollowgate-auth-bundles "$bundle"
root_secure "$checksums" "$bundle/compose.core-release.yaml" \
  "$bundle/compose.auth-public.yaml" "$bundle/compose.auth-public-off.yaml" \
  "$bundle/Caddyfile.candidate" "$bundle/preflight-public-auth-schema.mjs" \
  "$bundle/auth-web" "$bundle/auth-web/index.trial.html" \
  "$bundle/auth-web/app.mjs" "$bundle/auth-web/flow.mjs" \
  "$bundle/auth-web/styles.css"
for asset in index.trial.html app.mjs flow.mjs styles.css; do
  mode=$(stat -c %a "$bundle/auth-web/$asset")
  (( (8#$mode & 004) != 0 )) || die 'static auth asset not readable by Caddy'
done
[[ $(sha256sum "$checksums" | cut -d' ' -f1) == "$expected" ]] || die 'manifest hash mismatch'
python3 - "$checksums" <<'PY' || die 'incomplete or unsafe hash manifest'
import re,sys
lines=open(sys.argv[1],encoding='ascii').read().splitlines()
required={'compose.core-release.yaml','compose.auth-public.yaml',
          'compose.auth-public-off.yaml','Caddyfile.candidate',
          'preflight-public-auth-schema.mjs','auth-web/index.trial.html',
          'auth-web/app.mjs','auth-web/flow.mjs','auth-web/styles.css'}
parsed=[re.fullmatch(r'[a-f0-9]{64}  ([A-Za-z0-9./_-]+)',line) for line in lines]
assert all(parsed) and {match.group(1) for match in parsed}==required
assert len(parsed)==len(required)
PY
(cd "$bundle" && sha256sum --status -c SHA256SUMS) || die 'bundle file hash mismatch'

# This candidate must differ from the *live* Caddyfile in exactly two public
# matchers. No staging, apex, API or security header changes are permitted.
python3 - "$caddyfile" "$bundle/Caddyfile.candidate" <<'PY' || die 'Caddy candidate differs from narrow route change'
from pathlib import Path
import re,sys
old=Path(sys.argv[1]).read_bytes(); new=Path(sys.argv[2]).read_bytes()
marker=b'www.hollowgate.quest {\n'
assert old.count(marker)==1
start=old.index(marker)+len(marker)
end=re.search(rb'^}\s*$',old[start:],re.M)
assert end
end=start+end.start()
public=old[start:end]
for line in (b'@publicAuthPages path / /login /forgot-password /account/password',
             b'@authPages path /login /forgot-password /account/password'):
    pattern=rb'^([ \t]*)'+re.escape(line)+rb'[ \t]*$'
    assert len(re.findall(pattern,public,re.M))==1
    public=re.sub(pattern,lambda m:m.group(1)+line+b' /signup /account/verify-email',
                  public,count=1,flags=re.M)
assert new==old[:start]+public+old[end:]
PY

# Verify the actual Caddy bind mount, rather than trusting the host path.
docker inspect --format '{{json .Mounts}}' "$gateway" |
  python3 -c '
import json,sys
m=json.load(sys.stdin)
assert any(x["Source"]==sys.argv[1] and x["Destination"]=="/etc/caddy/Caddyfile" for x in m)
assert any(x["Source"]==sys.argv[2] and x["Destination"]=="/srv/auth-preview" for x in m)
' "$caddyfile" "$web" || die 'Caddy bind mount differs; inspect before deployment'
docker exec -i "$gateway" caddy validate --config /dev/stdin --adapter caddyfile \
  < "$bundle/Caddyfile.candidate" >/dev/null || die 'Caddy candidate validation failed'

[[ $(stat -c %u:%a /opt/hollowgate-production-oauth) == 0:700 ]] ||
  die 'production OAuth directory owner/permissions unsafe'
for path in /opt/hollowgate-production-oauth/ids.env \
  /opt/hollowgate-production-oauth/google_client_secret \
  /opt/hollowgate-production-oauth/discord_client_secret; do
  [[ -s $path && $(stat -c %a "$path") == 600 ]] || die 'production OAuth file missing or permissions unsafe'
done
root_secure /opt/hollowgate-production-oauth/ids.env
runtime_user=$(docker inspect --format '{{.Config.User}}' "$api")
[[ $runtime_user =~ ^([1-9][0-9]*):([1-9][0-9]*)$ ]] || die 'production API user not explicit non-root'
runtime_uid=${BASH_REMATCH[1]} runtime_gid=${BASH_REMATCH[2]}
for path in /opt/hollowgate-production-oauth/google_client_secret \
  /opt/hollowgate-production-oauth/discord_client_secret; do
  [[ ! -L $path && $(stat -c %u:%g "$path") == "$runtime_uid:$runtime_gid" ]] ||
    die 'OAuth secret not owned by restricted API runtime'
done
for provider in google discord; do
   if [[ -f /opt/hollowgate/config/staging_${provider}_oauth_secret ]] &&
      cmp -s "/opt/hollowgate-production-oauth/${provider}_client_secret" \
        "/opt/hollowgate/config/staging_${provider}_oauth_secret"; then
    die 'production OAuth secret equals staging secret'
  fi
done

docker compose "${common[@]}" "${overlays[@]}" config --quiet || die 'Compose invalid'
image=$(docker compose "${common[@]}" "${overlays[@]}" config --images)
[[ $(docker image inspect --format '{{.Id}}' "$image") == $(docker inspect --format '{{.Image}}' "$api") ]] ||
  die 'Compose image differs from live core API'
docker compose "${common[@]}" "${overlays[@]}" config --format json |
  python3 -c '
import json,sys
c=json.load(sys.stdin); s=c["services"]["aruba-api"]; e=s["environment"]
assert e["PGDATABASE"]=="hollowgate" and e["PGUSER"]=="hollowgate_auth_app"
assert e["AUTH_ORIGIN"]=="https://www.hollowgate.quest"
assert e["AUTH_SIGNUP_ENABLED"]=="true" and e["AUTH_OAUTH_ENABLED"]=="true"
assert e["GOOGLE_OAUTH_CLIENT_ID"] and e["DISCORD_OAUTH_CLIENT_ID"]
assert e["GOOGLE_OAUTH_CLIENT_ID"]!=e["DISCORD_OAUTH_CLIENT_ID"]
assert e["GOOGLE_OAUTH_CLIENT_SECRET_FILE"]=="/run/secrets/production_google_oauth_secret"
assert e["DISCORD_OAUTH_CLIENT_SECRET_FILE"]=="/run/secrets/production_discord_oauth_secret"
assert {"hollowgate-db","public-gateway"}==set(s["networks"])
assert s["networks"]["public-gateway"]["aliases"]==["hollowgate-production-api"]
assert c["networks"]["public-gateway"]["name"]=="hollowgate-auth-staging_default"
secret_names={x if isinstance(x,str) else x["source"] for x in s["secrets"]}
assert {"production_google_oauth_secret","production_discord_oauth_secret"}<=secret_names
assert e["RESEND_API_KEY_FILE"].startswith("/run/secrets/")
assert e["RESEND_API_KEY_FILE"].split("/")[-1] in secret_names
' || die 'effective Compose missing production safety requirements'
resend_file=$(docker compose "${common[@]}" "${overlays[@]}" config --format json |
  python3 -c '
import json,sys
from pathlib import PurePosixPath
c=json.load(sys.stdin); service=c["services"]["aruba-api"]
target=service["environment"]["RESEND_API_KEY_FILE"].split("/")[-1]
matches=[x if isinstance(x,str) else x["source"] for x in service["secrets"]
         if PurePosixPath(x if isinstance(x,str) else x.get("target",x["source"])).name==target]
assert len(matches)==1
print(c["secrets"][matches[0]]["file"])
') || die 'production mail secret mapping missing'
[[ ! -L $resend_file && -s $resend_file && $(stat -c %a "$resend_file") == 600 &&
   $(stat -c %u:%g "$resend_file") == "$runtime_uid:$runtime_gid" ]] ||
  die 'production mail secret missing or permissions unsafe'

code=$(cat "$bundle/preflight-public-auth-schema.mjs")
docker exec "$api" node --input-type=module -e "$code" || die 'production schema/grants incomplete'
docker exec "$gateway" sh -c \
  'wget -q -O /dev/null http://hollowgate-production-api:3000/ready' || die 'gateway API unreachable'
for path in ready login vtt/; do
  [[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://www.hollowgate.quest/$path") == 200 ]] ||
    die 'public health failed'
done
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) == 404 ]] ||
  die 'signup unexpectedly already exposed'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' ||
  die 'OAuth unexpectedly already enabled'
echo "AUTH_PREFLIGHT_OK: $id — read-only, no feature enabled"
