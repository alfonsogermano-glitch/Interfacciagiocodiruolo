#!/usr/bin/env bash
set -Eeuo pipefail
upload=/home/hgadmin/hollowgate-private-upload/auth-web-original-landing
target=/opt/hollowgate/aruba-source/apps/aruba-auth-web
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
caddy=hollowgate-staging-edge-caddy-1
for name in index.trial.html app.mjs flow.mjs styles.css; do test -s "$upload/$name"; done
install -m 0644 "$upload/index.trial.html" "$target/index.trial.html"
install -m 0644 "$upload/app.mjs" "$target/app.mjs"
install -m 0644 "$upload/flow.mjs" "$target/flow.mjs"
install -m 0644 "$upload/styles.css" "$target/styles.css"
python3 - "$file" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text()
old='@publicAuthPages path /login /forgot-password /account/password'
new='@publicAuthPages path / /login /forgot-password /account/password'
if new not in s:
    if old not in s: raise SystemExit('public auth page matcher not found')
    s=s.replace(old,new,1)
if new in s and new+' /signup' not in s:
    s=s.replace(new,new+' /signup /account/verify-email',1)
elif new+' /signup' in s and '/account/verify-email' not in s.split('@publicAuthPages path ',1)[1].split('\n',1)[0]:
    s=s.replace(new+' /signup',new+' /signup /account/verify-email',1)
s=s.replace('@frontendEntry path / /vtt /vtt/','@frontendEntry path /vtt /vtt/',1)
p.write_text(s)
PY
docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 https://www.hollowgate.quest/ | grep -Fq 'id="landing"'
curl -fsS --resolve www.hollowgate.quest:443:127.0.0.1 https://www.hollowgate.quest/login | grep -Fq 'id="auth-overlay"'
echo ORIGINAL_LANDING_READY
