#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo_root="$(pwd)"
tmp="$(mktemp -d)"
name="hg-turn-smoke-$$"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
mkdir -p "$tmp/tls"
openssl rand -hex 32 > "$tmp/turn_shared_secret"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=turn.example.invalid -keyout "$tmp/tls/turn-privkey.pem" -out "$tmp/tls/turn-fullchain.pem" >/dev/null 2>&1
chmod 600 "$tmp/turn_shared_secret" "$tmp/tls/"*.pem
docker run -d --name "$name" --network bridge --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /run/hollowgate:rw,nosuid,size=1048576,mode=0700 -e TURN_HOSTNAME=turn.example.invalid -e TURN_PUBLIC_IPV4=203.0.113.10 -v "$repo_root/../../deploy/aruba/turn/start-turn.sh:/opt/hollowgate/start-turn.sh:ro" -v "$tmp/turn_shared_secret:/run/secrets/turn_shared_secret:ro" -v "$tmp/tls/turn-fullchain.pem:/run/tls/turn-fullchain.pem:ro" -v "$tmp/tls/turn-privkey.pem:/run/tls/turn-privkey.pem:ro" --entrypoint /bin/sh coturn/coturn:4.18.0-r0-alpine /opt/hollowgate/start-turn.sh >/dev/null
sleep 4
if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
  echo 'coturn isolated runtime failed to remain running' >&2
  exit 1
fi
docker exec "$name" sh -c 'test -s /run/hollowgate/turnserver.conf && test -f /run/hollowgate/turnserver.pid'
echo 'COTURN_ISOLATED_RUNTIME_SUCCESS'
