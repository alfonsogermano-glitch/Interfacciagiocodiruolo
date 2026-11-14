#!/usr/bin/env bash
# Explicit staging-only chapter migration. Never run on production.
set -Eeuo pipefail
cd /opt/hollowgate/aruba-source
[[ "$(git branch --show-current)" == 'feature/aruba-api-foundation' ]] || { echo 'Ramo non autorizzato' >&2; exit 1; }
[[ "${CHAPTER_STAGING_MIGRATION_CONFIRM:-}" == 'hollowgate_auth_test' ]] || { echo 'Conferma esplicita richiesta: CHAPTER_STAGING_MIGRATION_CONFIRM=hollowgate_auth_test' >&2; exit 1; }
[[ -f deploy/aruba/sql/chapters/001_chapter_documents.sql ]] || { echo 'Migrazione assente' >&2; exit 1; }
echo 'Verifico il database PostgreSQL isolato...'
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()" | grep -Fx 'hollowgate_auth_test'
echo 'Applico esclusivamente la migrazione Capitoli sul database di staging...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/chapters/001_chapter_documents.sql
echo 'Verifico tabella e funzioni SQL installate...'
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT to_regclass('hollowgate_vtt.chapter_documents') IS NOT NULL AND to_regprocedure('hollowgate_vtt.save_owned_chapter_document(uuid,uuid,uuid,jsonb)') IS NOT NULL" | grep -Fx 't'
echo 'Eseguo i test SQL transazionali sul database di staging...'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/chapters/test_chapter_documents.sql
echo 'CHAPTER_STAGING_SCHEMA_APPLIED: schema e test SQL verificati; abilitazione HTTP ancora disattivata.'
