#!/usr/bin/env bash
set -Eeuo pipefail
base=/home/hgadmin/hollowgate-private-upload
source="$base/vtt-pilot-fixed"
media_archive="$base/legacy-public-media.tar.gz"
web=/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
caddy=hollowgate-staging-edge-caddy-1
test -s "$source/index.html"
cp -a "$source/." "$web/"
if [[ -s "$media_archive" ]]; then
  mkdir -p "$web/migrated-media"
  tar -xzf "$media_archive" -C "$web/migrated-media"
fi
chmod -R a+rX "$web"
python3 - "$file" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text()
marker='  @api path /auth/* /vtt/* /health /ready\n'
route='''  @vttPublicFiles path /vtt/hollowgate-logo.png /vtt/icon-source-1024.png /vtt/favicon.ico /vtt/favicon-*.png /vtt/apple-touch-icon.png /vtt/android-chrome-*.png /vtt/site.webmanifest /vtt/title-main.png /vtt/title-sub.png /vtt/header-pattern.png /vtt/footer-pattern.png /vtt/eye_animation_final.gif /vtt/death-skull.svg /vtt/condition-* /vtt/eye-anim/* /vtt/emoji-flags/* /vtt/eye_frames_monster/* /vtt/eye_frames_v3/* /vtt/monster-backgrounds/*
  handle @vttPublicFiles {
    uri strip_prefix /vtt
    root * /srv/vtt-pilot
    file_server
  }
'''
if '@vttPublicFiles path' not in s:
    if marker not in s: raise SystemExit('API marker not found')
    p.write_text(s.replace(marker,route+marker,1))
elif '/vtt/migrated-media/*' not in s:
    s=s.replace('@vttPublicFiles path ','@vttPublicFiles path /vtt/migrated-media/* ',1)
    p.write_text(s)
PY
docker restart "$caddy" >/dev/null
docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 https://www.hollowgate.quest/vtt/hollowgate-logo.png >/dev/null
curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 https://www.hollowgate.quest/vtt/icon-source-1024.png >/dev/null
if [[ -s "$media_archive" ]]; then
  sample=$(python3 - "$web/migrated-media/manifest.json" <<'PY'
import json,sys
print(json.load(open(sys.argv[1]))['items'][0]['publicPath'])
PY
)
  curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 "https://www.hollowgate.quest$sample" >/dev/null
fi
echo VTT_RUNTIME_FIX_READY
