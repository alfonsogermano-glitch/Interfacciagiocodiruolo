#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
[[ "${ARUBA_STAGING_CONFIRM:-}" == "APPLY_VISUAL_ASSETS_TO_DISPOSABLE_STAGING" ]] || { echo 'Conferma staging mancante' >&2; exit 1; }
sudo docker exec hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test -Atc "SELECT current_database()='hollowgate_auth_test' AND to_regclass('hollowgate_vtt.campaigns') IS NOT NULL AND to_regclass('hollowgate_vtt.character_player_assignments') IS NOT NULL AND to_regprocedure('hollowgate_vtt.list_assigned_player_character_sheets(uuid,uuid)') IS NOT NULL" | grep -Fx 't'
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/001_visual_assets.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/002_visual_asset_content.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/003_player_visual_asset_read.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/test_visual_assets.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/test_visual_asset_content.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/test_player_visual_asset_read.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/004_campaign_branding.sql
sudo docker exec -i hollowgate-postgres-1 psql -X -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate_auth_test < deploy/aruba/sql/visual-assets/test_campaign_branding.sql
echo 'Storage Asset Grafici, contenuto owner, letture player-scoped e branding campagna applicati e verificati sullo staging isolato.'
