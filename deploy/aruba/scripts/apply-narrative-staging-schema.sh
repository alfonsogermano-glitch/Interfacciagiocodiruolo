#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${ARUBA_STAGING_CONFIRM:-}" == "APPLY_NARRATIVE_TO_DISPOSABLE_STAGING" ]] || { echo 'Conferma staging mancante' >&2; exit 1; }
[[ -f deploy/aruba/sql/narrative/001_narrative_content.sql ]] || { echo 'Migrazione contenuti assente' >&2; exit 1; }
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.scene_documents') IS NOT NULL AND to_regclass('hollowgate_vtt.visual_assets') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/narrative/001_narrative_content.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/narrative/002_narrative_entity_notes.sql
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT to_regclass('hollowgate_vtt.narrative_content_documents') IS NOT NULL AND to_regclass('hollowgate_vtt.narrative_entity_notes') IS NOT NULL AND to_regprocedure('hollowgate_vtt.save_owned_narrative_content(uuid,uuid,text,uuid,jsonb)') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/narrative/test_narrative_content.sql
echo 'Schema contenuti narrativi applicato e verificato sullo staging isolato.'
