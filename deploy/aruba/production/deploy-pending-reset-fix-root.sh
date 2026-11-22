#!/usr/bin/env bash
set -Eeuo pipefail
base=/home/hgadmin/hollowgate-private-upload
release="$base/hollowgate-aruba-production-linux"
api=hollowgate-production-private-aruba-api-1
docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate < "$base/035_auth_pending_reset_activation.sql"
cp "$base/password-reset-service.mjs" "$release/apps/aruba-api/src/password-reset-service.mjs"
cd "$release"
docker compose -p hollowgate-production-private -f compose.private.yaml -f compose.private-port.yaml up -d --build --force-recreate
docker network connect bridge "$api" 2>/dev/null || true
docker network connect --alias hollowgate-production-api hollowgate-auth-staging_default "$api" 2>/dev/null || true
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3004/ready; then echo; echo PENDING_RESET_FIX_READY; exit 0; fi
  sleep 1
done
exit 1
