#!/usr/bin/env bash
# Restore static-only preview and disable email/signup/reset features.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
echo "Ripristino anteprima statica HTTPS..."
sudo docker compose -f deploy/aruba/compose.edge-staging.yaml up -d --no-deps --force-recreate caddy
echo "Disabilito invio email e registrazione nel container di prova..."
sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml up -d --no-deps --force-recreate aruba-auth-staging
code=""
for ((i=1; i<=20; i++)); do
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 4 \
    --resolve staging.hollowgate.quest:443:127.0.0.1 \
    https://staging.hollowgate.quest/auth/signup 2>/dev/null)" || code=""
  [[ "$code" == 404 ]] && break
  sleep 1
done
[[ "$code" == 404 ]] || { echo "Attenzione: API pubblica risponde ${code:-nessuna risposta}" >&2; exit 1; }
echo "STATIC_PREVIEW_RESTORED: /auth/signup=404; email automatica disabilitata."
