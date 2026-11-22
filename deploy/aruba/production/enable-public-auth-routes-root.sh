#!/usr/bin/env bash
set -Eeuo pipefail
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
python3 - "$file" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
marker='www.hollowgate.quest {\n  encode zstd gzip\n'
routes='''www.hollowgate.quest {
  encode zstd gzip
  @publicAuthPages path /login /forgot-password /account/password
  handle @publicAuthPages {
    root * /srv/auth-preview
    rewrite * /index.trial.html
    file_server
  }
  @publicAuthAssets path /auth-ui/app.mjs /auth-ui/flow.mjs /auth-ui/styles.css
  handle @publicAuthAssets {
    root * /srv/auth-preview
    uri strip_prefix /auth-ui
    file_server
  }
'''
if '@publicAuthPages path /login' not in s:
    if marker not in s: raise SystemExit('www marker not found')
    p.write_text(s.replace(marker,routes,1))
PY
docker exec hollowgate-staging-edge-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec hollowgate-staging-edge-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo PUBLIC_AUTH_ROUTES_READY
