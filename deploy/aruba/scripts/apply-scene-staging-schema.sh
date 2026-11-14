#!/usr/bin/env bash
# Explicit staging-only Scene migration. Never run on production.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
[[ "$(git branch --show-current)" == 'feature/aruba-api-foundation' ]] || { echo 'Ramo non autorizzato' >&2; exit 1; }
[[ "${SCENE_STAGING_MIGRATION_CONFIRM:-}" == 'hollowgate_auth_test' ]] || { echo 'Conferma esplicita richiesta: SCENE_STAGING_MIGRATION_CONFIRM=hollowgate_auth_test' >&2; exit 1; }
[[ -f deploy/aruba/sql/scenes/001_scene_documents.sql ]] || { echo 'Migrazione Scene assente' >&2; exit 1; }
echo 'Verifico il database PostgreSQL isolato e lo schema Capitoli richiesto...'
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.chapter_documents') IS NOT NULL" | grep -Fx 't'
echo 'Applico esclusivamente la migrazione Scene sul database di staging...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/scenes/001_scene_documents.sql
echo 'Verifico tabella e funzioni Scene installate...'
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT to_regclass('hollowgate_vtt.scene_documents') IS NOT NULL AND to_regprocedure('hollowgate_vtt.save_owned_scene_document(uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL" | grep -Fx 't'
echo 'Eseguo i test SQL transazionali delle Scene sul database di staging...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/scenes/test_scene_documents.sql
echo 'SCENE_STAGING_SCHEMA_APPLIED: schema e test SQL verificati; abilitazione HTTP ancora disattivata.'
