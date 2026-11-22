#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${ARUBA_STAGING_CONFIRM:-}" == "APPLY_CAMPAIGN_DOCUMENTS_TO_DISPOSABLE_STAGING" ]] || { echo 'Conferma staging mancante' >&2; exit 1; }
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.campaigns') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/campaign-documents/001_campaign_documents.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/campaign-documents/002_session_document_keys.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/campaign-documents/test_campaign_documents.sql
echo 'Documenti campagna applicati e verificati sullo staging isolato.'
