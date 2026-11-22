#!/usr/bin/env bash
# APPROVED LEGAL PAGES ONLY. No VTT bundle, API/Compose/SQL/OAuth/staging edits.
# Install a pinned root-owned copy before execution. Never run from uploads.
set -Eeuo pipefail
umask 077
# Keep operator diagnostics visible even if a signal arrives while a child
# command's stdout/stderr are redirected into private logs.
exec 4>&2
die(){ echo "PUBLIC_LEGAL_STOP: $*" >&4; exit 1; }
(( EUID == 0 )) || die 'approved sudo session required'
[[ $# == 1 && $1 =~ ^[a-f0-9]{64}$ ]] || die 'expected input manifest SHA-256'
source=/home/hgadmin/hg-public-legal-20261122
work=/opt/hollowgate-public-legal-20261122
web=/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
isolated=/opt/hollowgate/staging-trial/Caddyfile.staging-isolated
gateway=hollowgate-staging-edge-caddy-1
expected=05b06f6da2b655f5c3248cbd54fee0cd3f9a2ce06259766502bbce40b757603b
expected_candidate=b5ac1260525018dd32044fafc7560fb9406f518dbdb2f1cf897f449f81d99d11
phase=preflight
trap 'status=$?; echo "PUBLIC_LEGAL_ERROR: phase=$phase line=$LINENO exit=$status" >&4' ERR
[[ ! -e $work && ! -L $work ]] || die 'release already attempted; inspect, do not repeat'
[[ -d $web && ! -L $web && -f $web/index.html ]] || die 'expected public VTT bind missing'
[[ ! -e $web/site-pages && ! -L $web/site-pages ]] || die 'site-pages already exists; never overwrite it'
[[ -f $file && ! -L $file && $(sha256sum "$file" | cut -d' ' -f1) == "$expected" ]] || die 'shared live Caddyfile changed'
[[ -f $isolated && ! -L $isolated ]] || die 'isolated staging config missing'
mkdir -m 700 "$work"
for name in SHA256SUMS manifest.json privacy.html elimina-dati.html prepare-public-legal-routes.py; do
  [[ -f $source/$name && ! -L $source/$name ]] || die 'input missing or symlink'
  install -o root -g root -m 600 "$source/$name" "$work/$name"
done
[[ $(sha256sum "$work/SHA256SUMS" | cut -d' ' -f1) == "$1" ]] || die 'manifest hash mismatch'
(cd "$work" && sha256sum --status -c SHA256SUMS) || die 'immutable input hash mismatch'
python3 - "$work" <<'PY'
import hashlib,json,re,sys
from pathlib import Path
root=Path(sys.argv[1])
entries=(root/'SHA256SUMS').read_text().splitlines()
assert len(entries)==4
assert {line.split('  ',1)[1] for line in entries}=={'manifest.json','privacy.html','elimina-dati.html','prepare-public-legal-routes.py'}
manifest=json.loads((root/'manifest.json').read_text())
assert manifest['schemaVersion']==1
assert [(p['path'],p['file']) for p in manifest['pages']]==[('/privacy','privacy.html'),('/elimina-dati','elimina-dati.html')]
for page in manifest['pages']:
    data=(root/page['file']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==page['sha256']
    assert not re.search(rb'<script\b|<iframe\b|supabase\.co',data,re.I)
    assert b'<html lang="it">' in data and b'<h1 ' in data
PY

# Only non-secret mount metadata. Verify the actual shared PUBLIC container,
# not an ambiguous network alias and not the isolated staging gateway.
docker inspect --format '{{json .Mounts}}' "$gateway" > "$work/gateway-mounts.json"
python3 - "$work/gateway-mounts.json" "$file" "$web" <<'PY'
import json,sys
mounts={m['Destination']:m for m in json.load(open(sys.argv[1]))}
for destination,source in (('/etc/caddy/Caddyfile',sys.argv[2]),('/srv/vtt-pilot',sys.argv[3])):
    m=mounts[destination]
    assert m['Type']=='bind' and m['Source']==source and m['RW'] is False
PY
snapshot_containers(){
  local ids
  ids=$(docker ps --no-trunc -q | sort)
  [[ -n $ids ]] || return 1
  docker inspect --format '{{.Id}}|{{.Image}}|{{.State.StartedAt}}|{{.State.Running}}' $ids | sort
}
http_200(){ [[ $(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$1") == 200 ]]; }
baseline_http(){
  local path
  for path in ready login signup vtt/; do http_200 "https://www.hollowgate.quest/$path" || return 1; done
  http_200 https://staging.hollowgate.quest/ready
}
baseline_http || die 'baseline public/staging HTTP check failed before release'
snapshot_containers > "$work/containers.before"
vtt_hash=$(sha256sum "$web/index.html" | cut -d' ' -f1)
isolated_hash=$(sha256sum "$isolated" | cut -d' ' -f1)
inode=$(stat -c %i "$file")
cp -a "$file" "$work/Caddyfile.before"
python3 "$work/prepare-public-legal-routes.py" "$work/Caddyfile.before" "$work/Caddyfile.candidate"
[[ $(sha256sum "$work/Caddyfile.candidate" | cut -d' ' -f1) == "$expected_candidate" ]] || die 'candidate differs from reviewed route-only patch'
docker exec -i "$gateway" caddy validate --config /dev/stdin --adapter caddyfile \
  < "$work/Caddyfile.candidate" > "$work/validation.private.log" 2>&1 || die 'Caddy candidate rejected before mutation'
echo 'PUBLIC_LEGAL_PREFLIGHT_AND_BACKUP_OK'

pages_created=0
pages_inode=
config_changed=0
on_exit(){
  local status=$1 failed=0
  trap - EXIT
  if (( status == 0 || (pages_created == 0 && config_changed == 0) )); then return; fi
  if (( config_changed )); then
    local current_hash
    current_hash=$(sha256sum "$file" | cut -d' ' -f1) || failed=1
    # Do not overwrite an independent operator's new config or replaced inode.
    [[ ! -L $file && $(stat -c %i "$file") == "$inode" &&
       ( $current_hash == "$expected_candidate" || $current_hash == "$expected" ) ]] || failed=1
    if (( failed == 0 )); then
      cat "$work/Caddyfile.before" > "$file" || failed=1
      docker exec "$gateway" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
        >> "$work/rollback.private.log" 2>&1 || failed=1
      docker exec "$gateway" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
        >> "$work/rollback.private.log" 2>&1 || failed=1
    fi
  fi
  # Never delete/replace existing web content. Newly created pages can be
  # moved back into the private work directory once old routing is restored.
  if (( pages_created && failed == 0 )); then
    [[ -d $web/site-pages && ! -L $web/site-pages &&
       $(stat -c %i "$web/site-pages") == "$pages_inode" ]] || failed=1
    if (( failed == 0 )); then mv -T "$web/site-pages" "$work/unserved-pages" || failed=1; fi
  fi
  if (( failed )); then echo 'PUBLIC_LEGAL_ROLLBACK_INCOMPLETE — inspect private logs; do not repeat' >&4
  else echo 'PUBLIC_LEGAL_ROLLBACK_OK — previous routing restored; VTT/API/data untouched' >&4; fi
}
trap 'on_exit $?' EXIT
trap 'exit 1' HUP INT TERM
[[ $(sha256sum "$file" | cut -d' ' -f1) == "$expected" ]] || die 'Caddyfile changed during preflight'
[[ ! -e $web/site-pages && ! -L $web/site-pages ]] || die 'legal target changed during preflight'
# Separate exclusive creation from chmod: a chmod failure after successful
# mkdir must still roll back OUR new directory, not leave an untracked target.
phase=static-pages
mkdir "$web/site-pages"
pages_created=1
pages_inode=$(stat -c %i "$web/site-pages")
chmod 755 "$web/site-pages"
for name in privacy.html elimina-dati.html; do
  install -o root -g root -m 644 "$work/$name" "$web/site-pages/$name"
  cmp -s "$work/$name" "$web/site-pages/$name" || die 'page copy differs'
  docker exec "$gateway" test -r "/srv/vtt-pilot/site-pages/$name" || die 'page not readable through actual Caddy bind'
done
config_changed=1
phase=caddy-reload
# Preserve the inode of the Caddyfile bind mount. Never replace via rename.
cat "$work/Caddyfile.candidate" > "$file"
[[ $(stat -c %i "$file") == "$inode" ]] || die 'Caddy bind inode changed'
cmp -s "$work/Caddyfile.candidate" "$file" || die 'candidate copy mismatch'
docker exec "$gateway" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
  > "$work/reload.private.log" 2>&1 || die 'public Caddy reload failed'
echo 'PUBLIC_LEGAL_CADDY_RELOADED'

phase=https-and-invariants
for page in privacy elimina-dati; do
  curl -fsS --max-time 20 --header 'Cache-Control: no-cache' \
    "https://www.hollowgate.quest/$page?legal-release=20261122" \
    > "$work/$page.https.html" || die 'public HTTPS page failed'
  cmp -s "$work/$page.html" "$work/$page.https.html" || die 'public HTTPS content hash differs'
done
baseline_http || die 'public/staging baseline changed after reload'
snapshot_containers > "$work/containers.after"
cmp -s "$work/containers.before" "$work/containers.after" || die 'running container/image/start time changed independently'
[[ $(sha256sum "$web/index.html" | cut -d' ' -f1) == "$vtt_hash" ]] || die 'VTT entry changed independently'
[[ $(sha256sum "$isolated" | cut -d' ' -f1) == "$isolated_hash" ]] || die 'isolated staging config changed independently'
[[ $(sha256sum "$file" | cut -d' ' -f1) == "$expected_candidate" ]] || die 'shared Caddyfile changed independently; do not overwrite other work'
phase=complete
echo 'PUBLIC_LEGAL_RELEASE_OK — two original pages verified over HTTPS; VTT entry/containers/staging config unchanged; no SQL/API/OAuth deployment'
