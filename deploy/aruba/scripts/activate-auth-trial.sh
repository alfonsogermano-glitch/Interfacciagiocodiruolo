#!/usr/bin/env bash
# Activate a password-gated staging-only auth trial. No production changes.
set -Eeuo pipefail
umask 077
cd /opt/hollowgate/aruba-source
[[ "$(git branch --show-current)" == "feature/aruba-api-foundation" ]] || { echo "Ramo Git inatteso" >&2; exit 1; }
[[ -s /opt/hollowgate/config/resend_api_key ]] || { echo "Chiave Resend assente" >&2; exit 1; }
[[ -s /opt/hollowgate/config/auth_trial_hash ]] || { echo "Password privata assente. Esegui prepare-auth-trial.sh" >&2; exit 1; }
[[ "$(sudo head -c 4 /opt/hollowgate/config/auth_trial_hash)" == '$2a$' || "$(sudo head -c 4 /opt/hollowgate/config/auth_trial_hash)" == '$2b$' ]] || { echo "Hash bcrypt non valido" >&2; exit 1; }
api="hollowgate-auth-staging-aruba-auth-staging-1"
sudo docker exec "$api" sh -c '[ "$PGDATABASE" = hollowgate_auth_test ] && [ "$PGUSER" = hollowgate_auth_app ] && [ "$AUTH_STAGING_ENABLED" = true ]' || { echo "Il backend non è isolato" >&2; exit 1; }
# Verify migration 007 exists in the disposable test database; no writes.
check="$(sudo docker exec hollowgate-postgres-1 psql -X -Atq -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -c "SELECT to_regprocedure('hollowgate_auth.register_local_user(text,text,text,bytea)') IS NOT NULL AND to_regprocedure('hollowgate_auth.confirm_local_email(bytea)') IS NOT NULL")"
[[ "$check" == t ]] || { echo "Migrazione signup 007 assente nel DB di prova" >&2; exit 1; }
db=( -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml )
edge=( -f deploy/aruba/compose.edge-staging.yaml -f deploy/aruba/compose.edge-auth-trial.yaml )
echo "Controllo configurazioni e segreti..."
sudo docker compose "${db[@]}" config --quiet
sudo docker compose "${edge[@]}" config --quiet
sudo docker compose "${edge[@]}" run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
# Do not make secrets available to the public-facing Caddy container except hash.
rollback(){
  local code=$?
  trap - ERR
  echo "Attivazione non riuscita: ripristino dei servizi di prova..." >&2
  sudo docker compose -f deploy/aruba/compose.edge-staging.yaml up -d --no-deps --force-recreate caddy || true
  sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml up -d --no-deps --force-recreate aruba-auth-staging || true
  exit "$code"
}
trap rollback ERR
echo "Attivo prima il backend limitato al database di prova..."
sudo docker compose "${db[@]}" up -d --no-deps --build aruba-auth-staging
echo "Attivo poi il varco privato HTTPS..."
sudo docker compose "${edge[@]}" up -d --no-deps --force-recreate caddy

# Test HTTPS via the local loopback with the correct hostname/SNI and TLS
# verification. Direct public-domain curl from the VPS can fail on router
# hairpin NAT even while external clients work. Retry until Caddy is ready.
local_url="https://staging.hollowgate.quest"
probe(){
  local path="$1" expected="$2" actual=""
  for ((attempt=1; attempt<=20; attempt++)); do
    actual="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 4 \
      --resolve staging.hollowgate.quest:443:127.0.0.1 "$local_url$path" 2>/dev/null)" || actual=""
    if [[ "$actual" == "$expected" ]]; then return 0; fi
    sleep 1
  done
  echo "Controllo HTTPS fallito: $path (atteso $expected, ottenuto ${actual:-nessuna risposta})" >&2
  return 1
}
echo "Verifico che pagine e API richiedano autenticazione aggiuntiva..."
probe /auth/signup 401
probe /login 401
probe /auth-ui/app.mjs 401
probe /health 200
trap - ERR
echo "AUTH_TRIAL_PRIVATE_SUCCESS: login/API protetti, diagnostica funzionante."
echo "Apri https://staging.hollowgate.quest/signup con utente tester e password privata."
