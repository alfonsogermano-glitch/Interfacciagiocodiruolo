#!/usr/bin/env bash
set -Eeuo pipefail
base=/home/hgadmin/hollowgate-private-upload
source_release="$base/hollowgate-aruba-production-linux"
caddyfile=/opt/hollowgate/aruba-source/deploy/aruba/Caddyfile.auth-trial
webroot=/opt/hollowgate/aruba-source/deploy/aruba/dist/vtt-pilot
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup=/opt/hollowgate/cutover-backup-$stamp
log="$base/public-cutover.log"
caddy=hollowgate-staging-edge-caddy-1
api=hollowgate-production-private-aruba-api-1
edge_network=hollowgate-staging-edge_default
finish(){ chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true; }
rollback(){
  cp "$backup/Caddyfile" "$caddyfile" || true
  rm -rf "$webroot"; cp -a "$backup/vtt-pilot" "$webroot" || true
  docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
}
trap finish EXIT
exec >"$log" 2>&1
install -d -m 700 "$backup"
cp -a "$caddyfile" "$backup/Caddyfile"
cp -a "$webroot" "$backup/vtt-pilot"
rm -rf "$webroot.new"
cp -a "$source_release/web" "$webroot.new"
test -s "$webroot.new/index.html"
rm -rf "$webroot"
mv "$webroot.new" "$webroot"
docker network connect "$edge_network" "$api" 2>/dev/null || true
if ! grep -q '^www\.hollowgate\.quest {' "$caddyfile"; then
cat >>"$caddyfile" <<'CADDY'

www.hollowgate.quest {
  encode zstd gzip
  @vttAssets path /vtt/assets/*
  handle @vttAssets {
    uri strip_prefix /vtt
    root * /srv/vtt-pilot
    file_server
  }
  @frontendEntry path / /vtt /vtt/
  handle @frontendEntry {
    root * /srv/vtt-pilot
    rewrite * /index.html
    file_server
  }
  @publicFiles path /favicon.ico /favicon-*.png /apple-touch-icon.png /android-chrome-*.png /site.webmanifest /hollowgate-logo.png /title-main.png /title-sub.png /header-pattern.png /eye_animation_final.gif /eye-anim/* /condition-* /death-skull.svg
  handle @publicFiles {
    root * /srv/vtt-pilot
    file_server
  }
  @api path /auth/* /vtt/* /health /ready
  handle @api {
    reverse_proxy hollowgate-production-private-aruba-api-1:3000
  }
  handle {
    respond "Not Found" 404
  }
  header {
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options DENY
    Permissions-Policy "camera=(), microphone=(), geolocation=()"
    -Server
  }
}
CADDY
fi
if ! docker exec "$caddy" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then rollback; exit 1; fi
if ! docker exec "$caddy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then rollback; exit 1; fi
docker exec "$caddy" wget -qO- http://$api:3000/ready
echo
echo "CADDY_CUTOVER_READY backup=$backup"
