#!/usr/bin/env bash
# Core API + VTT release only. NO SQL, Caddy changes, signup or OAuth enablement.
# Install root-owned after review; never run from a writable upload directory.
set -Eeuo pipefail
umask 077

die() { echo "STOP: $*" >&2; exit 1; }
[[ $# == 3 || ( $# == 4 && $4 == --preflight ) ]] ||
  die 'usage: release-core.sh /opt/hollowgate-core-manifests/ID.json SHA256 ID [--preflight]'
(( EUID == 0 )) || die 'run as root via sudo after explicit release approval'
manifest=$1 expected_manifest=$2 id=$3
[[ $id =~ ^[a-z0-9][a-z0-9-]{4,63}$ ]] || die 'invalid release ID'
[[ $expected_manifest =~ ^[a-f0-9]{64}$ ]] || die 'invalid manifest digest'
[[ $manifest == "/opt/hollowgate-core-manifests/$id.json" ]] || die 'manifest outside approved directory'
root_secure() {
  local path mode
  for path in "$@"; do
    [[ ! -L $path && $(stat -c %u "$path") == 0 ]] || die "not root-owned or symlink: $path"
    mode=$(stat -c %a "$path")
    (( (8#$mode & 022) == 0 )) || die "writable by non-root: $path"
  done
}
root_secure /opt/hollowgate-core-manifests "$manifest"
[[ $(sha256sum "$manifest" | cut -d' ' -f1) == "$expected_manifest" ]] || die 'manifest SHA-256 mismatch'

metadata=$(python3 - "$manifest" "$id" <<'PY'
import json,re,sys
with open(sys.argv[1],encoding='utf-8') as f: m=json.load(f)
keys={'id','image','image_id','rollback_image','release_compose_sha256',
      'rollback_compose_sha256','vtt_index_sha256','vtt_asset','vtt_asset_sha256'}
assert set(m)==keys and all(isinstance(v,str) for v in m.values())
assert m['id']==sys.argv[2]
for k in ('release_compose_sha256','rollback_compose_sha256','vtt_index_sha256','vtt_asset_sha256'):
    assert re.fullmatch('[a-f0-9]{64}',m[k])
assert re.fullmatch('sha256:[a-f0-9]{64}',m['image_id'])
assert re.fullmatch(r'hollowgate-api-core-[a-z0-9-]+:[a-z0-9-]+',m['image'])
assert re.fullmatch(r'hollowgate-api-core-rollback:[a-z0-9-]+',m['rollback_image'])
assert re.fullmatch(r'index-[A-Za-z0-9_-]+\.js',m['vtt_asset'])
for k in ('image','image_id','rollback_image','release_compose_sha256',
          'rollback_compose_sha256','vtt_index_sha256','vtt_asset','vtt_asset_sha256'):
    print(m[k])
PY
) || die 'invalid manifest'
mapfile -t fields <<< "$metadata"
image=${fields[0]} image_id=${fields[1]} rollback_image=${fields[2]}
release_hash=${fields[3]} rollback_hash=${fields[4]} index_hash=${fields[5]}
asset=${fields[6]} asset_hash=${fields[7]}
base=/home/hgadmin/hollowgate-private-upload/hollowgate-aruba-production-linux
bundle="/opt/hollowgate-core-bundles/$id"
web=/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot
backup="/opt/hollowgate-core-rollback/$id"
api=hollowgate-production-private-aruba-api-1
gateway=hollowgate-staging-edge-caddy-1
common=(-p hollowgate-production-private -f "$base/compose.private.yaml" -f "$base/compose.private-port.yaml")
release=(-f "$bundle/compose.core-release.yaml")
rollback=(-f "$bundle/compose.core-rollback.yaml")

digest_is() { [[ $(sha256sum "$1" | cut -d' ' -f1) == "$2" ]]; }
public_200() {
  local code
  code=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "https://www.hollowgate.quest/$1") || return 1
  [[ $code == 200 ]]
}
ready() {
  docker exec "$gateway" sh -c 'wget -q -O /dev/null http://hollowgate-production-api:3000/ready' &&
    public_200 ready && public_200 login && public_200 vtt/
}
check_compose() {
  local overlay=$1 expected_image=$2 signup=$3
  docker compose "${common[@]}" -f "$overlay" config --quiet
  docker compose "${common[@]}" -f "$overlay" config --format json |
    python3 -c '
import json,sys
c=json.load(sys.stdin); s=c["services"]["aruba-api"]
assert s["image"]==sys.argv[1]
assert set(s["networks"])=={"hollowgate-db","public-gateway"}
assert s["networks"]["public-gateway"]["aliases"]==["hollowgate-production-api"]
assert c["networks"]["public-gateway"]["name"]=="hollowgate-auth-staging_default"
if sys.argv[2]=="off":
    assert s["environment"]["AUTH_SIGNUP_ENABLED"]=="false"
    assert s["environment"]["AUTH_OAUTH_ENABLED"]=="false"
' "$expected_image" "$signup"
}
container_is() {
  [[ $(docker inspect --format '{{.Image}}' "$api") == "$1" ]] || return 1
  docker exec "$api" node -e "process.exit(process.env.PGDATABASE==='hollowgate'?0:1)" || return 1
  docker inspect --format '{{json .NetworkSettings.Networks}}' "$api" |
    python3 -c 'import json,sys; n=json.load(sys.stdin);
assert {"hollowgate-db","hollowgate-auth-staging_default"} <= set(n);
assert "hollowgate-production-api" in n["hollowgate-auth-staging_default"]["Aliases"]'
}

# All checks above and below are read-only until backup + tag succeed.
[[ -d $bundle && -d $web && -d /opt/hollowgate-core-rollback && ! -e $backup ]] ||
  die 'bundle/web/rollback parent missing or rollback directory already exists'
root_secure /opt/hollowgate-core-bundles "$bundle" "$bundle/vtt" "$bundle/vtt/assets" \
  "$bundle/compose.core-release.yaml" "$bundle/compose.core-rollback.yaml" \
  "$bundle/vtt/index.html" "$bundle/vtt/assets/$asset" /opt/hollowgate-core-rollback
[[ ! -e $web/assets/$asset ]] || die 'new asset already exists; inspect, do not repeat'
[[ ! -e $web/.index.html.core-release-$id && ! -e $web/.index.html.core-rollback-$id ]] || die 'temporary index already exists'
digest_is "$bundle/compose.core-release.yaml" "$release_hash" || die 'release overlay hash mismatch'
digest_is "$bundle/compose.core-rollback.yaml" "$rollback_hash" || die 'rollback overlay hash mismatch'
digest_is "$bundle/vtt/index.html" "$index_hash" || die 'index hash mismatch'
digest_is "$bundle/vtt/assets/$asset" "$asset_hash" || die 'JS hash mismatch'
grep -Fq "/vtt/assets/$asset" "$bundle/vtt/index.html" || die 'index does not reference JS'
[[ $(grep -Eo '/vtt/assets/index-[A-Za-z0-9_-]+\.css' "$bundle/vtt/index.html" | wc -l) == 1 ]] || die 'unexpected CSS references'
css=$(grep -Eo 'index-[A-Za-z0-9_-]+\.css' "$bundle/vtt/index.html")
[[ -f $web/assets/$css ]] || die 'existing CSS missing'
[[ $(docker image inspect --format '{{.Id}}' "$image") == "$image_id" ]] || die 'candidate image mismatch'
if docker image inspect "$rollback_image" >/dev/null 2>&1; then die 'rollback tag already exists'; fi
check_compose "$bundle/compose.core-release.yaml" "$image" off || die 'unsafe release Compose'
check_compose "$bundle/compose.core-rollback.yaml" "$rollback_image" any || die 'unsafe rollback Compose'
ready || die 'public site not healthy before release'
[[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/signup) == 404 ]] || die 'signup already exposed: not a core-only release'
curl -fsS --max-time 15 https://www.hollowgate.quest/auth/oauth/providers |
  python3 -c 'import json,sys; assert json.load(sys.stdin)=={"providers":[]}' || die 'OAuth already enabled: not a core-only release'
old_image=$(docker inspect --format '{{.Image}}' "$api")
container_is "$old_image" || die 'public API network is not healthy'
if [[ ${4:-} == --preflight ]]; then
  echo "PREFLIGHT_OK: $id — no production changes"
  exit 0
fi

mkdir -m 700 "$backup"
cp -a "$web/index.html" "$backup/index.html"
printf '%s\n' "$old_image" > "$backup/previous-image-id"
docker tag "$old_image" "$rollback_image"
[[ $(docker image inspect --format '{{.Id}}' "$rollback_image") == "$old_image" ]] || die 'rollback tag mismatch'
cmp -s "$web/index.html" "$backup/index.html" || die 'index backup mismatch'

mutated=0
on_exit() {
  local status=$1
  trap - EXIT
  if (( status == 0 || mutated == 0 )); then return; fi
  echo 'RELEASE_FAILED: restoring old index and API' >&2
  local failed=0
  cp -a "$backup/index.html" "$web/.index.html.core-rollback-$id" &&
    mv -f "$web/.index.html.core-rollback-$id" "$web/index.html" || failed=1
  docker compose "${common[@]}" "${rollback[@]}" up -d --no-deps --no-build --force-recreate aruba-api || failed=1
  container_is "$old_image" && ready || failed=1
  if (( failed )); then echo 'ROLLBACK_INCOMPLETE: urgent intervention required' >&2
  else echo 'ROLLBACK_OK: old index, image, network and WWW healthy' >&2; fi
}
trap 'on_exit $?' EXIT
trap 'exit 1' HUP INT TERM

mutated=1
docker compose "${common[@]}" "${release[@]}" up -d --no-deps --no-build --force-recreate aruba-api
container_is "$image_id" && ready || die 'new API or public health failed'
cp -a "$bundle/vtt/assets/$asset" "$web/assets/$asset"
cmp -s "$bundle/vtt/assets/$asset" "$web/assets/$asset" || die 'asset copy failed'
[[ $(curl -fsS --max-time 60 "https://www.hollowgate.quest/vtt/assets/$asset" | sha256sum | cut -d' ' -f1) == "$asset_hash" ]] || die 'public JS digest mismatch'
cp -a "$bundle/vtt/index.html" "$web/.index.html.core-release-$id"
mv "$web/.index.html.core-release-$id" "$web/index.html"
cmp -s "$bundle/vtt/index.html" "$web/index.html" || die 'index mismatch'
html=$(curl -fsS --max-time 15 https://www.hollowgate.quest/vtt/)
[[ $html == *"/vtt/assets/$asset"* && $html == *"/vtt/assets/$css"* ]] || die 'public index mismatch'
container_is "$image_id" && ready || die 'post-release public health failed'
echo "RELEASE_OK: $id — API, VTT and public health verified; signup/OAuth still off"
