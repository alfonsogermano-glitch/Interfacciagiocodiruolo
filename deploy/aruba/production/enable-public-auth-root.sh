#!/usr/bin/env bash
set -Eeuo pipefail
base=/home/hgadmin/hollowgate-private-upload
release="$base/hollowgate-aruba-production-linux"
caddyfile=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
caddy=hollowgate-staging-edge-caddy-1
api=hollowgate-production-private-aruba-api-1
log="$base/public-auth-enable.log"
finish(){ chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true; }
trap finish EXIT
exec >"$log" 2>&1
cp "$base/index.production.mjs" "$release/apps/aruba-api/src/index.mjs"
cp "$base/password-reset-service.production.mjs" "$release/apps/aruba-api/src/password-reset-service.mjs"
sed -i 's/^AUTH_PASSWORD_RESET_ENABLED=false$/AUTH_PASSWORD_RESET_ENABLED=true/' "$release/config/production.env"
python3 - "$caddyfile" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
marker='www.hollowgate.quest {\n  encode zstd gzip\n'
routes='''www.hollowgate.quest {
  encode zstd gzip
  @authPages path /login /forgot-password /account/password
  handle @authPages {
    root * /srv/auth-preview
    rewrite * /index.trial.html
    file_server
  }
  @authAssets path /auth-ui/app.mjs /auth-ui/flow.mjs /auth-ui/styles.css
  handle @authAssets {
    root * /srv/auth-preview
    uri strip_prefix /auth-ui
    file_server
  }
'''
if marker in s:
    s=s.replace(marker,routes,1); p.write_text(s)
elif 'www.hollowgate.quest {\n  encode zstd gzip\n  @authPages path /login' not in s:
    raise SystemExit('www marker not found')
PY
cd "$release"
docker compose -p hollowgate-production-private -f compose.private.yaml -f compose.private-port.yaml up -d --build --force-recreate
docker network connect bridge "$api" 2>/dev/null || true
docker network connect --alias hollowgate-production-api hollowgate-auth-staging_default "$api" 2>/dev/null || true
docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3004/ready && break; sleep 1; done
curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 https://www.hollowgate.quest/login >/dev/null
echo PUBLIC_AUTH_READY
