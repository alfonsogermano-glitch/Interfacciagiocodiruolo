#!/usr/bin/env bash
# Explicit approval required: one matcher line + reload in ISOLATED staging
# Caddy only. No SQL, API recreation, public Caddy file or web asset changes.
set -Eeuo pipefail
umask 077
die(){ echo "STAGING_ROUTES_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'approved sudo session required'
[[ $# == 1 && $1 =~ ^[a-f0-9]{64}$ ]] || die 'expected generator SHA-256'
source=/home/hgadmin/hg-staging-campaign-routes-20261121
work=/opt/hollowgate-staging-campaign-routes-20261121
file=/opt/hollowgate/staging-trial/Caddyfile.staging-isolated
expected=e02038e1bd90bb2e9e654d41d38358b70e682c60388f28372323964ecf0893f2
[[ ! -e $work ]] || die 'route fix already attempted; do not repeat'
[[ -f $file && ! -L $file && $(sha256sum "$file" | head -c 64) == "$expected" ]] || die 'live isolated Caddyfile changed'
mkdir -m 700 "$work"
install -o root -g root -m 600 "$source/prepare-staging-campaign-routes.py" "$work/generator.py"
[[ $(sha256sum "$work/generator.py" | head -c 64) == "$1" ]] || die 'generator hash mismatch'
cp -a "$file" "$work/Caddyfile.before"
python3 "$work/generator.py" "$work/Caddyfile.before" "$work/Caddyfile.candidate"
inode=$(stat -c %i "$file")

# Select by the actual bind mount, never by guessing a container name or the
# generic caddy alias shared on the Docker network.
edge=$(python3 - "$file" <<'PY'
import json,subprocess,sys
ids=subprocess.check_output(['docker','ps','--filter','label=com.docker.compose.service=caddy','--format','{{.ID}}'],text=True).split()
assert ids
containers=json.loads(subprocess.check_output(['docker','inspect',*ids],text=True))
selected=[]
for c in containers:
    mounts={m['Destination']:m for m in c['Mounts']}
    if mounts.get('/etc/caddy/Caddyfile',{}).get('Source')!=sys.argv[1]:continue
    assert c['Name']!='/hollowgate-staging-edge-caddy-1'
    assert mounts['/etc/caddy/Caddyfile']['Type']=='bind'
    assert mounts.get('/srv/auth-preview',{}).get('Source')=='/opt/hollowgate-staging-auth-web'
    assert mounts.get('/srv/vtt-pilot',{}).get('Source')=='/opt/hollowgate/staging-trial/vtt-pilot'
    bindings=c['HostConfig']['PortBindings'] or {}
    assert set(bindings)=={'443/tcp'}
    assert bindings['443/tcp']==[{'HostIp':'127.0.0.1','HostPort':'8443'}]
    selected.append(c['Id'])
assert len(selected)==1
print(selected[0])
PY
) || die 'cannot identify exactly one isolated staging gateway with safe mounts/ports'
production_before=$(docker inspect --format '{{.Id}}' hollowgate-production-private-aruba-api-1)
public_caddy_before=$(docker inspect --format '{{.Id}}' hollowgate-staging-edge-caddy-1)
public_ready(){ [[ $(curl -sS --max-time 12 -o /dev/null -w '%{http_code}' https://www.hollowgate.quest/ready) == 200 ]]; }
public_ready || die 'production not healthy before isolated route fix'
docker exec -i "$edge" caddy validate --config /dev/stdin --adapter caddyfile \
  < "$work/Caddyfile.candidate" > "$work/validation.private.log" 2>&1 || die 'candidate rejected before changes'
echo 'STAGING_ROUTES_CANDIDATE_VALID'
changed=0
on_exit(){
  local status=$1 failed=0
  trap - EXIT
  if (( status == 0 || changed == 0 )); then return; fi
  cat "$work/Caddyfile.before" > "$file" || failed=1
  [[ $(stat -c %i "$file") == "$inode" ]] || failed=1
  docker exec "$edge" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    >> "$work/rollback.private.log" 2>&1 || failed=1
  docker exec "$edge" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
    >> "$work/rollback.private.log" 2>&1 || failed=1
  if (( failed )); then echo 'STAGING_ROUTES_ROLLBACK_INCOMPLETE — do not repeat' >&2
  else echo 'STAGING_ROUTES_ROLLBACK_OK — previous isolated routing restored' >&2; fi
}
trap 'on_exit $?' EXIT
trap 'exit 1' HUP INT TERM
[[ $(sha256sum "$file" | head -c 64) == "$expected" ]] || die 'live file changed after validation'
changed=1
# File bind mount: preserve inode, do not rename the host file.
cat "$work/Caddyfile.candidate" > "$file"
[[ $(stat -c %i "$file") == "$inode" ]] || die 'bind inode changed'
cmp -s "$file" "$work/Caddyfile.candidate" || die 'candidate copy mismatch'
docker exec "$edge" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  > "$work/reload.private.log" 2>&1 || die 'isolated Caddy reload failed'
[[ $(docker inspect --format '{{.State.Running}}' "$edge") == true ]] || die 'isolated Caddy stopped'
[[ $(docker inspect --format '{{.Id}}' hollowgate-production-private-aruba-api-1) == "$production_before" &&
   $(docker inspect --format '{{.Id}}' hollowgate-staging-edge-caddy-1) == "$public_caddy_before" ]] || die 'public containers changed independently'
public_ready || die 'public readiness changed'
echo 'STAGING_CAMPAIGN_ROUTES_OK — isolated Caddy reloaded; no SQL/API/public Caddy changes; browser QA required'
