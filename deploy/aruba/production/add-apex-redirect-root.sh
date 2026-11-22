#!/usr/bin/env bash
set -Eeuo pipefail
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
caddy=hollowgate-staging-edge-caddy-1
backup="$file.before-apex"
cp "$file" "$backup"
if ! grep -q '^hollowgate\.quest {' "$file"; then
cat >>"$file" <<'CADDY'

hollowgate.quest {
  redir https://www.hollowgate.quest{uri} permanent
}
CADDY
fi
if ! docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then cp "$backup" "$file"; exit 1; fi
if ! docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then cp "$backup" "$file"; docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true; exit 1; fi
echo APEX_REDIRECT_READY
