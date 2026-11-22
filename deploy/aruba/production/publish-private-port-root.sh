#!/usr/bin/env bash
set -Eeuo pipefail
base=/home/hgadmin/hollowgate-private-upload
release="$base/hollowgate-aruba-production-linux"
log="$base/private-port.log"
finish(){ chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true; }
trap finish EXIT
exec >"$log" 2>&1
cd "$release"
cat > compose.private-port.yaml <<'YAML'
services:
  aruba-api:
    ports:
      - "127.0.0.1:3004:3000"
YAML
docker compose -p hollowgate-production-private -f compose.private.yaml -f compose.private-port.yaml up -d --no-build --force-recreate
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3004/ready >/dev/null; then
    curl -fsS http://127.0.0.1:3004/health
    echo
    curl -fsS http://127.0.0.1:3004/ready
    echo
    echo PRIVATE_INSTALL_OK
    exit 0
  fi
  sleep 1
done
docker compose -p hollowgate-production-private -f compose.private.yaml -f compose.private-port.yaml logs --tail=50 aruba-api
exit 1
