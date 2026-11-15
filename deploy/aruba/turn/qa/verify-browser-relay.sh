#!/usr/bin/env bash
# Disposable CI runner only. No production network and no published host ports.
set -Eeuo pipefail
umask 077
repo_root="$(cd "$(dirname "$0")/../../../.." && pwd)"
tmp="$(mktemp -d)"
name="hg-browser-turn-$$"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  sudo rm -rf "$tmp"
}
trap cleanup EXIT
openssl rand -hex 32 > "$tmp/shared-secret"
# CI-only coturn configuration: Docker bridge traffic is allowed to test
# two relay ICE peers. This is NOT the protected Aruba deployment config.
cat > "$tmp/turnserver.conf" <<CONF
fingerprint
use-auth-secret
realm=turn.example.invalid
server-name=turn.example.invalid
listening-port=3478
min-port=49160
max-port=49200
log-file=stdout
pidfile=/tmp/turnserver.pid
static-auth-secret=$(cat "$tmp/shared-secret")
CONF
chmod 600 "$tmp/shared-secret" "$tmp/turnserver.conf"
sudo chown 65534:65534 "$tmp/turnserver.conf"
cd "$repo_root/apps/aruba-vtt-pilot"
docker build -q -t hollowgate-coturn:4.18.0-r0-hardened \
  -f ../../deploy/aruba/turn/Dockerfile ../.. >/dev/null
docker run -d --name "$name" --network bridge --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,nosuid,size=1048576,mode=0700,uid=65534,gid=65534 \
  -v "$tmp/turnserver.conf:/run/turnserver.conf:ro" \
  --entrypoint /usr/bin/turnserver hollowgate-coturn:4.18.0-r0-hardened \
  -c /run/turnserver.conf >/dev/null
sleep 3
if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
  echo 'Isolated browser TURN container failed to start' >&2
  exit 1
fi
ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name")"
[[ "$ip" =~ ^[0-9.]+$ ]] || { echo 'Invalid CI TURN IP' >&2; exit 1; }
TURN_TEST_HOST="$ip" TURN_TEST_SECRET_FILE="$tmp/shared-secret" \
  node test/browser-webrtc-relay.mjs
