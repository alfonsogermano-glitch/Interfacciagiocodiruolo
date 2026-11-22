#!/usr/bin/env bash
# Real Docker/Caddy bind-file/reload rehearsal. NO production changes,
# no DB, no secrets, no host ports. Only reads existing image IDs.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo 'AUTH_GATEWAY_QA_STOP: requires sudo'; exit 1; }
network=hg-auth-gateway-qa-20261121-v3
edge=hg-auth-gateway-qa-edge-20261121-v3
api=hg-auth-gateway-qa-api-20261121-v3
root=/opt/hollowgate-auth-gateway-qa-20261121-v3
stage=setup
trap 'status=$?; echo "AUTH_GATEWAY_QA_ERROR: stage=$stage line=$LINENO exit=$status" >&2' ERR
[[ ! -e $root ]] || { echo 'AUTH_GATEWAY_QA_STOP: QA already attempted'; exit 1; }
if docker network inspect "$network" >/dev/null 2>&1; then echo 'AUTH_GATEWAY_QA_STOP: QA network exists'; exit 1; fi
for name in "$edge" "$api"; do
  if docker container inspect "$name" >/dev/null 2>&1; then echo 'AUTH_GATEWAY_QA_STOP: QA container exists'; exit 1; fi
done
caddy_image=$(docker inspect --format '{{.Image}}' hollowgate-staging-edge-caddy-1)
api_image=$(docker inspect --format '{{.Image}}' hollowgate-production-private-aruba-api-1)
mkdir -m 755 "$root"
mkdir -m 755 "$root/web"
printf 'qa-auth-page\n' > "$root/web/index.html"
chmod 644 "$root/web/index.html"
cat > "$root/Caddyfile" <<'CADDY'
{
  auto_https off
  admin localhost:2019
}
:8080 {
  @pages path /login
  handle @pages {
    root * /qa-web
    rewrite * /index.html
    file_server
  }
  @api path /ready
  handle @api {
    reverse_proxy qa-api:3000
  }
  handle {
    respond "Not Found" 404
  }
}
CADDY
chmod 644 "$root/Caddyfile"
cp -a "$root/Caddyfile" "$root/Caddyfile.old"
sed 's|@pages path /login$|@pages path /login /signup /account/verify-email|' \
  "$root/Caddyfile.old" > "$root/Caddyfile.new"
inode=$(stat -c %i "$root/Caddyfile")
made_network=0 made_api=0 made_edge=0
cleanup(){
  local status=$1 failed=0
  trap - EXIT
  # Logs belong to synthetic containers with no secrets or real identities.
  # Save them BEFORE removing the QA containers so failure remains actionable.
  if (( status != 0 )); then
    echo "AUTH_GATEWAY_QA_DIAGNOSTIC: stage=$stage exit=$status" >&2
    if (( made_api )); then
      docker logs --tail 30 "$api" > "$root/api.log" 2>&1 || true
      echo '--- synthetic API log ---' >&2
      cat "$root/api.log" >&2
    fi
    if (( made_edge )); then
      docker logs --tail 30 "$edge" > "$root/caddy.log" 2>&1 || true
      echo '--- isolated Caddy log ---' >&2
      cat "$root/caddy.log" >&2
    fi
  fi
  if (( made_edge )); then docker rm -f "$edge" >/dev/null || failed=1; fi
  if (( made_api )); then docker rm -f "$api" >/dev/null || failed=1; fi
  if (( made_network )); then docker network rm "$network" >/dev/null || failed=1; fi
  if (( status != 0 || failed )); then
    echo 'AUTH_GATEWAY_QA_FAILED — inspect QA directory; do not deploy' >&2
    exit 1
  fi
  echo 'AUTH_GATEWAY_QA_OK — real bind-file validation/reload/rollback passed; isolated containers removed'
}
trap 'cleanup $?' EXIT
trap 'exit 1' HUP INT TERM
docker network create --internal "$network" >/dev/null
made_network=1
stage=api-start
docker run -d --name "$api" --network "$network" --network-alias qa-api \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --entrypoint node "$api_image" -e \
  "require('node:http').createServer((q,s)=>{s.writeHead(q.url==='/ready'?200:404);s.end('qa')}).listen(3000,'0.0.0.0')" >/dev/null
made_api=1
stage=caddy-start
docker run -d --name "$edge" --network "$network" --network-alias qa-edge \
  --cap-drop ALL --cap-add NET_BIND_SERVICE --security-opt no-new-privileges \
  -v "$root/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$root/web:/qa-web:ro" \
  --entrypoint caddy "$caddy_image" run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
made_edge=1
probe(){
  docker exec "$api" node -e \
    "fetch('http://qa-edge:8080/$1',{signal:AbortSignal.timeout(1500)}).then(r=>{console.log('QA_HTTP /$1 expected=$2 actual='+r.status);process.exit(r.status===$2?0:1)}).catch(e=>{console.error('QA_FETCH_FAILED /$1 '+(e.cause?.code??e.name));process.exit(1)})"
}
stage=initial-http-check
for ((attempt=1; attempt<=5; attempt++)); do
  [[ $(docker inspect --format '{{.State.Running}}' "$edge") == true &&
     $(docker inspect --format '{{.State.Running}}' "$api") == true ]] || {
    echo 'AUTH_GATEWAY_QA_STOP: synthetic API or Caddy exited' >&2
    exit 1
  }
  if probe ready 200; then break; fi
  sleep 1
done
probe ready 200
probe login 200
probe signup 404
probe account/verify-email 404
stage=candidate-validate
docker exec -i "$edge" caddy validate --config /dev/stdin --adapter caddyfile \
  < "$root/Caddyfile.new" >/dev/null
stage=bind-file-write
cat "$root/Caddyfile.new" > "$root/Caddyfile"
[[ $(stat -c %i "$root/Caddyfile") == "$inode" ]]
stage=candidate-reload
docker exec "$edge" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
probe ready 200
probe signup 200
probe account/verify-email 200
stage=rollback-bind-write
cat "$root/Caddyfile.old" > "$root/Caddyfile"
[[ $(stat -c %i "$root/Caddyfile") == "$inode" ]]
stage=rollback-reload
docker exec "$edge" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
docker exec "$edge" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
probe ready 200
probe login 200
probe signup 404
probe account/verify-email 404
stage=complete
