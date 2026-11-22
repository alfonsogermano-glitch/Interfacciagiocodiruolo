#!/usr/bin/env bash
# One-command phase-2 visibility switch. Requires a reviewed immutable bundle,
# successful preflight, rollback rehearsal and explicit release approval.
# Schema migration and provider provisioning are separate, prior approvals.
set -Eeuo pipefail
umask 077
die() { echo "AUTH_RELEASE_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run with sudo only after explicit approval'
[[ $# == 2 && $1 =~ ^[a-z0-9][a-z0-9-]{4,63}$ && $2 =~ ^[a-f0-9]{64}$ ]] ||
  die 'usage: release-public-auth.sh RELEASE_ID SHA256SUMS_DIGEST'
id=$1 digest=$2
bundle="/opt/hollowgate-auth-bundles/$id"
backup="/opt/hollowgate-auth-rollback/$id"
web=/opt/hollowgate/aruba-source/apps/aruba-auth-web
caddyfile=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
gateway=hollowgate-staging-edge-caddy-1
api=hollowgate-production-private-aruba-api-1
base=/home/hgadmin/hollowgate-private-upload/hollowgate-aruba-production-linux
common=(-p hollowgate-production-private -f "$base/compose.private.yaml" -f "$base/compose.private-port.yaml" -f "$bundle/compose.core-release.yaml")
on=(-f "$bundle/compose.auth-public.yaml")
off=(-f "$bundle/compose.auth-public-off.yaml")
assets=(index.trial.html app.mjs flow.mjs styles.css)

preflight=/opt/hollowgate-preflight-public-auth-20261121.sh
[[ -f $preflight && ! -L $preflight && $(stat -c %u "$preflight") == 0 ]] ||
  die 'root-owned preflight not installed'
"$preflight" "$id" "$digest" || die 'preflight failed; no production changes'
[[ -d /opt/hollowgate-auth-rollback && ! -e $backup ]] || die 'rollback directory missing or ID already used'
docker compose "${common[@]}" "${off[@]}" config --quiet || die 'rollback Compose invalid'
docker compose "${common[@]}" "${off[@]}" config --format json |
  python3 -c '
import json,sys
c=json.load(sys.stdin); s=c["services"]["aruba-api"]; e=s["environment"]
assert e["AUTH_SIGNUP_ENABLED"]=="false" and e["AUTH_OAUTH_ENABLED"]=="false"
assert set(s["networks"])=={"hollowgate-db","public-gateway"}
assert s["networks"]["public-gateway"]["aliases"]==["hollowgate-production-api"]
' || die 'rollback flags/network unsafe'

# Backups are made before *any* public mutation. In particular, Caddyfile is
# a bind-mounted FILE: never replace its inode using mv or an atomic rename.
mkdir -m 700 "$backup"
cp -a "$caddyfile" "$backup/Caddyfile"
mkdir -m 700 "$backup/auth-web"
for asset in "${assets[@]}"; do
  cp -a "$web/$asset" "$backup/auth-web/$asset"
  cmp -s "$web/$asset" "$backup/auth-web/$asset" || die 'auth-web backup mismatch'
done
cmp -s "$caddyfile" "$backup/Caddyfile" || die 'Caddy backup mismatch'
inode=$(stat -c %i "$caddyfile")
image_id=$(docker inspect --format '{{.Image}}' "$api")

wait_ready() {
  local attempt
  for ((attempt=1; attempt<=20; attempt++)); do
    if docker exec "$gateway" sh -c 'wget -q -O /dev/null http://hollowgate-production-api:3000/ready'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

check_public() {
  local path code
  [[ $(docker inspect --format '{{.Image}}' "$api") == "$image_id" ]] || return 1
  docker inspect --format '{{json .NetworkSettings.Networks}}' "$api" |
    python3 -c 'import json,sys; n=json.load(sys.stdin);
assert {"hollowgate-db","hollowgate-auth-staging_default"}<=set(n);
assert "hollowgate-production-api" in n["hollowgate-auth-staging_default"]["Aliases"]' || return 1
  docker exec "$gateway" sh -c 'wget -q -O /dev/null http://hollowgate-production-api:3000/ready' || return 1
  for path in ready login vtt/ signup account/verify-email; do
    code=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://www.hollowgate.quest/$path") || return 1
    [[ $code == 200 ]] || return 1
  done
  curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
    python3 -c 'import json,sys; p=json.load(sys.stdin)["providers"];
assert sorted(p)==["discord","google"]' || return 1
}
check_rolled_back() {
  local code
  code=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) || return 1
  [[ $code == 404 ]] || return 1
  curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
    python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' || return 1
  docker exec "$gateway" sh -c 'wget -q -O /dev/null http://hollowgate-production-api:3000/ready' || return 1
  for path in ready login vtt/; do
    [[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://www.hollowgate.quest/$path") == 200 ]] || return 1
  done
}

mutated=0
rollback() {
  local status=$1 failed=0
  trap - EXIT
  if (( status == 0 || mutated == 0 )); then return; fi
  echo 'AUTH_RELEASE_FAILED: restoring Caddy, auth assets and disabled API flags' >&2
  # Close public mutation endpoints first; /auth/* is already proxied even
  # before the signup page becomes visible.
  docker compose "${common[@]}" "${off[@]}" up -d --no-deps --no-build --force-recreate aruba-api || failed=1
  [[ $(docker inspect --format '{{.Image}}' "$api") == "$image_id" ]] || failed=1
  for asset in "${assets[@]}"; do
    cp -a "$backup/auth-web/$asset" "$web/$asset" || failed=1
  done
  cat "$backup/Caddyfile" > "$caddyfile" || failed=1
  [[ $(stat -c %i "$caddyfile") == "$inode" ]] || failed=1
  docker exec "$gateway" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || failed=1
  docker exec "$gateway" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || failed=1
  wait_ready && check_rolled_back || failed=1
  if (( failed )); then echo 'AUTH_ROLLBACK_INCOMPLETE: urgent intervention required' >&2
  else echo 'AUTH_ROLLBACK_OK: visibility off; existing accounts/emails remain' >&2; fi
}
trap 'rollback $?' EXIT
trap 'exit 1' HUP INT TERM

mutated=1
docker compose "${common[@]}" "${on[@]}" up -d --no-deps --no-build --force-recreate aruba-api
wait_ready || die 'API not ready after bounded startup wait'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert sorted(json.load(sys.stdin)["providers"])==["discord","google"]' || die 'providers not enabled'
for asset in "${assets[@]}"; do
  cp -a "$bundle/auth-web/$asset" "$web/$asset"
  cmp -s "$bundle/auth-web/$asset" "$web/$asset" || die 'auth-web file mismatch'
  docker exec "$gateway" sh -c "test -r /srv/auth-preview/$asset" || die 'Caddy cannot read auth asset'
done
cat "$bundle/Caddyfile.candidate" > "$caddyfile"
[[ $(stat -c %i "$caddyfile") == "$inode" ]] || die 'Caddyfile bind inode changed'
cmp -s "$bundle/Caddyfile.candidate" "$caddyfile" || die 'Caddyfile copy mismatch'
docker exec "$gateway" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || die 'Caddyfile validation failed'
docker exec "$gateway" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
check_public || die 'public authentication health failed'
echo "AUTH_RELEASE_OK: $id — email/social routes enabled; user/browser QA still required"
