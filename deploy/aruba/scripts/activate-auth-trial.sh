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
  sudo docker compose "${edge[@]:0:2}" up -d --no-deps --force-recreate caddy || true
  sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml up -d --no-deps --force-recreate aruba-auth-staging || true
  exit "$code"
}
trap rollback ERR
echo "Attivo prima il backend limitato al database di prova..."
sudo docker compose "${db[@]}" up -d --no-deps --build aruba-auth-staging
echo "Attivo poi il varco privato HTTPS..."
sudo docker compose "${edge[@]}" up -d --no-deps --force-recreate caddy
echo "Verifico che gli endpoint richiedano autenticazione aggiuntiva..."
status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://staging.hollowgate.quest/auth/signup)"
[[ "$status" == 401 ]] || { echo "Protezione assente, stato $status" >&2; false; }
status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://staging.hollowgate.quest/login)"
[[ "$status" == 401 ]] || { echo "Pagina privata non protetta: $status" >&2; false; }
status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://staging.hollowgate.quest/health)"
[[ "$status" == 200 ]] || { echo "Diagnostica non disponibile: $status" >&2; false; }
trap - ERR
echo "AUTH_TRIAL_PRIVATE_SUCCESS: login/API protetti, diagnostica funzionante."
echo "Apri https://staging.hollowgate.quest/signup con utente tester e password privata."
