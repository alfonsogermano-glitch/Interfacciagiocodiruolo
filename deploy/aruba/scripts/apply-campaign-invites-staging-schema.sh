#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${ARUBA_STAGING_CONFIRM:-}" == "APPLY_CAMPAIGN_INVITES_TO_DISPOSABLE_STAGING" ]] || { echo 'Conferma staging mancante' >&2; exit 1; }
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.campaigns') IS NOT NULL AND to_regclass('hollowgate_vtt.campaign_members') IS NOT NULL AND to_regprocedure('hollowgate_vtt.list_joined_player_campaigns(uuid)') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/033_vtt_campaign_invites.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/test_vtt_campaign_invites.sql
echo 'Inviti campagna digest-only applicati e verificati sullo staging isolato; capability HTTP ancora opt-in.'
