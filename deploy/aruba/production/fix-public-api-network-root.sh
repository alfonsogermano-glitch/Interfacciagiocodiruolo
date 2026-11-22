#!/usr/bin/env bash
set -Eeuo pipefail
api=hollowgate-production-private-aruba-api-1
caddy=hollowgate-staging-edge-caddy-1
network=hollowgate-auth-staging_default
file=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
docker network disconnect "$network" "$api" 2>/dev/null || true
docker network connect --alias hollowgate-production-api "$network" "$api"
sed -i 's/hollowgate-production-private-aruba-api-1:3000/hollowgate-production-api:3000/g' "$file"
docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$caddy" wget -T 5 -qO- http://hollowgate-production-api:3000/ready
echo
echo PUBLIC_API_PROXY_READY
