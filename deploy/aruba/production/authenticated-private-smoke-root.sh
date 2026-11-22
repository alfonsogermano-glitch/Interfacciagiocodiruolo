#!/usr/bin/env bash
set -Eeuo pipefail
api=hollowgate-production-private-aruba-api-1
db=$(docker ps --filter label=com.docker.compose.service=postgres --format '{{.Names}}' | head -1)
log=/home/hgadmin/hollowgate-private-upload/private-auth-smoke.log
IFS='|' read -r user_id email campaign_id asset_id < <(docker exec "$db" psql -X -At -U hollowgate -d hollowgate -c "SELECT u.id,u.email,c.id,a.id FROM hollowgate_vtt.visual_assets a JOIN hollowgate_vtt.campaigns c ON c.id=a.campaign_id JOIN hollowgate_auth.users u ON u.id=c.owner_id ORDER BY a.id LIMIT 1")
password=$(openssl rand -base64 36 | tr -d '\n')
finish(){
  docker exec -i "$db" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate >/dev/null <<SQL || true
BEGIN;
DELETE FROM hollowgate_auth.sessions WHERE user_id='$user_id';
DELETE FROM hollowgate_auth.password_credentials WHERE user_id='$user_id';
UPDATE hollowgate_auth.users SET status='pending_reset',email_verified_at=NULL WHERE id='$user_id';
COMMIT;
SQL
  unset password
  echo PRIVATE_AUTH_STATE_RESTORED
  chown hgadmin:hgadmin "$log" 2>/dev/null || true; chmod 600 "$log" 2>/dev/null || true
}
trap finish EXIT
exec >"$log" 2>&1
test -n "$asset_id"
hash=$(docker exec -e TEST_PASSWORD="$password" "$api" node --input-type=module -e "import {hashPassword} from '/app/src/password.mjs';console.log(await hashPassword(process.env.TEST_PASSWORD))")
docker exec -i "$db" psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate -v hash="$hash" <<SQL
BEGIN;
UPDATE hollowgate_auth.users SET status='active',email_verified_at=now() WHERE id='$user_id';
INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash) VALUES('$user_id',:'hash');
COMMIT;
SQL
docker exec -e TEST_PASSWORD="$password" -e TEST_EMAIL="$email" -e CAMPAIGN_ID="$campaign_id" -e ASSET_ID="$asset_id" -i "$api" node --input-type=module <<'NODE'
const origin='https://www.hollowgate.quest';
const ok=async(r,l)=>{if(!r.ok)throw new Error(`${l}: HTTP ${r.status}`);return r};
const login=await ok(await fetch('http://127.0.0.1:3000/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:process.env.TEST_EMAIL,password:process.env.TEST_PASSWORD})}),'login');
const token=/__Host-hg_session=([A-Za-z0-9_-]{43})/.exec(login.headers.get('set-cookie')||'')?.[1];
if(!token)throw new Error('No session');
const headers={cookie:`__Host-hg_session=${token}`};
const response=await ok(await fetch(`http://127.0.0.1:3000/vtt/campaigns/${process.env.CAMPAIGN_ID}/visual-assets/${process.env.ASSET_ID}/content`,{headers}),'asset');
const bytes=(await response.arrayBuffer()).byteLength;
if(!bytes)throw new Error('Empty asset');
console.log(JSON.stringify({status:'AUTHENTICATED_ASSET_OK',bytes}));
NODE
