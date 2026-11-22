#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${ARUBA_STAGING_CONFIRM:-}" == "APPLY_EQUIPMENT_TO_DISPOSABLE_STAGING" ]] || { echo 'Conferma staging mancante' >&2; exit 1; }
[[ -f deploy/aruba/sql/equipment/001_equipment_catalog.sql ]] || { echo 'Migrazione equipment assente' >&2; exit 1; }
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.campaigns') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/equipment/001_equipment_catalog.sql
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT to_regclass('hollowgate_vtt.equipment_catalog_documents') IS NOT NULL AND to_regprocedure('hollowgate_vtt.save_owned_equipment_catalog(uuid,uuid,uuid,jsonb)') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/equipment/test_equipment_catalog.sql
echo 'Schema Archivio Oggetti applicato e verificato sullo staging isolato.'
