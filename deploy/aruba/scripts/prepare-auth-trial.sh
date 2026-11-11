#!/usr/bin/env bash
# Set up a bcrypt secret hash via stdin, with no plaintext command arguments.
set -Eeuo pipefail
umask 077
api="hollowgate-auth-staging-aruba-auth-staging-1"
destination="/opt/hollowgate/config/auth_trial_hash"
[[ -t 0 ]] || { echo "Interactive SSH terminal required" >&2; exit 1; }
sudo docker exec "$api" sh -c '[ "$PGDATABASE" = hollowgate_auth_test ] && [ "$PGUSER" = hollowgate_auth_app ]' || { echo "Not the test API" >&2; exit 1; }
printf "Scegli una password NUOVA per il collaudo (minimo 16 caratteri): "
IFS= read -r -s password
printf "\n"
if (( ${#password} < 16 )); then echo "Password troppo breve" >&2; unset password; exit 1; fi
printf "Ripeti la password: "
IFS= read -r -s confirmation
printf "\n"
if [[ "$password" != "$confirmation" ]]; then echo "Le password non coincidono" >&2; unset password confirmation; exit 1; fi
unset confirmation
hash="$(printf '%s\n' "$password" |
  sudo docker run --rm -i caddy:2.10.2-alpine caddy hash-password --algorithm bcrypt)"
unset password
[[ "$hash" == '$2'* ]] || { echo "Errore bcrypt" >&2; exit 1; }
sudo install -m 600 /dev/null "$destination"
printf '%s' "$hash" | sudo tee "$destination" >/dev/null
unset hash
echo "Credenziale privata preparata. Username: tester"
echo "Conserva la password in un gestore; non inviarla in chat."
