#!/usr/bin/env bash
# Set up a secret hash without exposing the plaintext on command line.
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
hash="$(printf '%s' "$password" |
  sudo docker exec -i -w /app "$api" node --input-type=module -e '
import argon2 from "argon2";
let input="";for await(const chunk of process.stdin)input+=chunk;
process.stdout.write(await argon2.hash(input,{
  type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1
}));
')"
unset password
[[ "$hash" == '$argon2id$'* ]] || { echo "Errore Argon2id" >&2; exit 1; }
sudo install -m 600 /dev/null "$destination"
printf '%s' "$hash" | sudo tee "$destination" >/dev/null
unset hash
echo "Credenziale privata preparata. Username: tester"
echo "Conserva la password in un gestore; non inviarla in chat."
