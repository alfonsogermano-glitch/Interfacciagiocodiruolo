#!/usr/bin/env bash
# One-time production OAuth client provisioning; NEVER enables public OAuth.
# Enter all four values ONLY at the hidden prompts on the VPS terminal.
set -Eeuo pipefail
umask 077
die(){ echo "PROD_OAUTH_CONFIG_STOP: $*" >&2; exit 1; }
(( EUID == 0 )) || die 'run via sudo after approval'
[[ $# == 0 && -t 0 ]] || die 'interactive VPS terminal required; no CLI credentials'
dir=/opt/hollowgate-production-oauth
[[ ! -e $dir ]] || die 'production OAuth directory already exists; no overwrite'
[[ $(stat -c %u:%a /opt) == 0:755 ]] || die 'expected root-owned /opt directory'
runtime_user=$(docker inspect --format '{{.Config.User}}' hollowgate-production-private-aruba-api-1)
[[ $runtime_user =~ ^([1-9][0-9]*):([1-9][0-9]*)$ ]] ||
  die 'production API must run with an explicit non-root numeric UID:GID'
runtime_uid=${BASH_REMATCH[1]}
runtime_gid=${BASH_REMATCH[2]}
ids="$dir/ids.env"
google="$dir/google_client_secret"
discord="$dir/discord_client_secret"
for path in "$ids" "$google" "$discord"; do
  [[ ! -e $path && ! -L $path ]] || die 'production client file already exists; no overwrite'
done
staging=$(docker ps --filter label=com.docker.compose.project=hollowgate-auth-staging \
  --filter label=com.docker.compose.service=aruba-auth-staging --format '{{.ID}}')
[[ -n $staging && $staging != *$'\n'* ]] || die 'dedicated staging API not found'
staging_google=$(docker exec "$staging" node -p 'process.env.GOOGLE_OAUTH_CLIENT_ID ?? ""')
staging_discord=$(docker exec "$staging" node -p 'process.env.DISCORD_OAUTH_CLIENT_ID ?? ""')
[[ -n $staging_google && -n $staging_discord ]] || die 'staging IDs not configured'

echo 'Inserisci i valori dei DUE client PRODUZIONE, mai quelli staging.'
echo 'I prompt non mostrano caratteri e non scrivono valori nei log.'
read -rs -p 'Google client ID produzione: ' google_id; echo
read -rs -p 'Google client secret produzione: ' google_secret; echo
read -rs -p 'Discord application/client ID produzione: ' discord_id; echo
read -rs -p 'Discord client secret produzione: ' discord_secret; echo
[[ $google_id =~ ^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$ &&
   $discord_id =~ ^[0-9]{10,25}$ &&
   $google_id != "$staging_google" && $discord_id != "$staging_discord" ]] ||
  die 'client IDs invalid or reused from staging'
[[ ${#google_secret} -ge 20 && ${#google_secret} -le 512 &&
   ${#discord_secret} -ge 20 && ${#discord_secret} -le 512 &&
   $google_secret != *[[:space:]]* && $discord_secret != *[[:space:]]* ]] ||
  die 'client secrets invalid'
[[ -s /opt/hollowgate/config/staging_google_oauth_secret &&
   -s /opt/hollowgate/config/staging_discord_oauth_secret ]] ||
  die 'staging secrets unavailable for separation check'

install -d -o root -g root -m 700 "$dir"
[[ $(stat -c %u:%a "$dir") == 0:700 ]] || die 'production OAuth directory permissions unsafe'
tmp=$(mktemp -d "$dir/.production-oauth-XXXXXX")
installed=0
cleanup(){
  local status=$1
  trap - EXIT
  unset google_id google_secret discord_id discord_secret staging_google staging_discord
  if (( status != 0 && installed != 0 )); then
    rm -f -- "$ids" "$google" "$discord"
  fi
  rm -f -- "$tmp/ids" "$tmp/google" "$tmp/discord"
  rmdir -- "$tmp" 2>/dev/null || true
  rmdir -- "$dir" 2>/dev/null || true
}
trap 'cleanup $?' EXIT
trap 'exit 1' HUP INT TERM
printf 'GOOGLE_OAUTH_CLIENT_ID=%s\nDISCORD_OAUTH_CLIENT_ID=%s\n' "$google_id" "$discord_id" > "$tmp/ids"
printf '%s\n' "$google_secret" > "$tmp/google"
printf '%s\n' "$discord_secret" > "$tmp/discord"
unset google_id google_secret discord_id discord_secret
if cmp -s "$tmp/google" /opt/hollowgate/config/staging_google_oauth_secret ||
   cmp -s "$tmp/discord" /opt/hollowgate/config/staging_discord_oauth_secret; then
  die 'production secret equals a staging secret'
fi
installed=1
install -o root -g root -m 600 "$tmp/ids" "$ids"
install -o "$runtime_uid" -g "$runtime_gid" -m 600 "$tmp/google" "$google"
install -o "$runtime_uid" -g "$runtime_gid" -m 600 "$tmp/discord" "$discord"
[[ -s $ids && -s $google && -s $discord ]] || die 'production OAuth file installation incomplete'
[[ $(stat -c %u:%a "$ids") == 0:600 ]] || die 'unsafe OAuth ID file permissions'
for path in "$google" "$discord"; do
  [[ $(stat -c %u:%g:%a "$path") == "$runtime_uid:$runtime_gid:600" ]] ||
    die 'unsafe OAuth secret owner/permissions'
done
installed=0
echo 'PROD_OAUTH_CONFIG_READY — files installed; public OAuth still OFF'
