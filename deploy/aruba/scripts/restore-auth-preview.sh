#!/usr/bin/env bash
# Restore static-only preview and disable email/signup/reset features.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
echo "Ripristino anteprima statica HTTPS..."
sudo docker compose -f deploy/aruba/compose.edge-staging.yaml up -d --no-deps --force-recreate caddy
echo "Disabilito invio email e registrazione nel container di prova..."
sudo docker compose -p hollowgate-auth-staging -f deploy/aruba/compose.auth-staging.yaml up -d --no-deps --force-recreate aruba-auth-staging
code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 https://staging.hollowgate.quest/auth/signup)"
[[ "$code" == 404 ]] || { echo "Attenzione: API pubblica risponde $code" >&2; exit 1; }
echo "STATIC_PREVIEW_RESTORED: /auth/signup=404; email automatica disabilitata."
