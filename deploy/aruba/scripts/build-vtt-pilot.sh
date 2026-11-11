#!/usr/bin/env bash
# Compile isolated React pilot without building or deploying the Vercel VTT.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
[[ "$(git branch --show-current)" == "feature/aruba-api-foundation" ]] || { echo "Ramo non consentito" >&2; exit 1; }
echo "Compilo esclusivamente il portale React Aruba..."
uid="$(id -u):$(id -g)"
sudo docker run --rm --user "$uid" -e HOME=/tmp \
  -v "$PWD:/work" -w /work/apps/aruba-vtt-pilot node:24-alpine \
  sh -c "npm install --ignore-scripts --no-audit --no-fund && npm test && npm run build"
test -s deploy/aruba/dist/vtt-pilot/index.html
echo "PILOT_BUILD_SUCCESS (nessuna modifica al sito Vercel)"
