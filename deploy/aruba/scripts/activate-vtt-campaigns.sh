#!/usr/bin/env bash
# Safe opt-in: native campaigns only on isolated Aruba authentication staging.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
[[ "$(git branch --show-current)" == feature/aruba-api-foundation ]] || { echo 'Ramo Git errato' >&2; exit 1; }
[[ -s /opt/hollowgate/config/auth_trial_hash ]] || { echo 'Accesso privato non configurato' >&2; exit 1; }
[[ -s /opt/hollowgate/config/resend_api_key ]] || { echo 'Resend non configurato' >&2; exit 1; }
sudo docker exec hollowgate-auth-staging-aruba-auth-staging-1 sh -c '[ "$PGDATABASE" = hollowgate_auth_test ] && [ "$PGUSER" = hollowgate_auth_app ] && [ "$AUTH_STAGING_ENABLED" = true ]'
db=( -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml -f deploy/aruba/compose.campaign-trial.yaml )
edge=( -f deploy/aruba/compose.edge-staging.yaml -f deploy/aruba/compose.edge-auth-trial.yaml )
sudo docker compose "${db[@]}" config --quiet
sudo docker compose "${edge[@]}" config --quiet
echo 'Compilo il nuovo VTT React isolato...'
bash deploy/aruba/scripts/build-vtt-pilot.sh
echo 'Controllo e installo lo schema 008 esclusivamente sul database hollowgate_auth_test...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/008_vtt_campaigns.sql
echo 'Applico le modifiche metadata 009 solo al database hollowgate_auth_test...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/009_vtt_campaign_updates.sql
echo 'Verifico la configurazione privata Caddy...'
sudo docker compose "${edge[@]}" run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
rollback(){
  local code=$?
  trap - ERR
  echo 'Errore: torno al collaudo privato senza campagne abilitate...' >&2
  sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml -f deploy/aruba/compose.auth-trial.yaml up -d --no-deps --force-recreate aruba-auth-staging || true
  sudo docker compose "${edge[@]}" up -d --no-deps --force-recreate caddy || true
  exit "$code"
}
trap rollback ERR
echo 'Attivo solo i servizi staging con sessioni Aruba...'
sudo docker compose "${db[@]}" up -d --no-deps --build aruba-auth-staging
sudo docker compose "${edge[@]}" up -d --no-deps --force-recreate caddy
check(){
  local path="$1" expected="$2" status=''
  for ((i=1;i<=20;i++)); do
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 4 --resolve staging.hollowgate.quest:443:127.0.0.1 "https://staging.hollowgate.quest$path" 2>/dev/null)" || status=''
    [[ "$status" == "$expected" ]] && return 0
    sleep 1
  done
  echo "Verifica fallita $path (atteso $expected, ricevuto ${status:-nessuna risposta})" >&2
  return 1
}
check /vtt/ 401
check /vtt/campaigns 401
check /auth/login 401
check /health 200
trap - ERR
echo 'ARUBA_CAMPAIGNS_STAGING_SUCCESS: VTT e campagne protetti; PostgreSQL isolato.'
echo 'Apri https://staging.hollowgate.quest/login e poi /vtt/ con un utente di prova.'
