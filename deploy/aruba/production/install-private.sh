#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# This is the historical initial installer, NOT an updater. In particular it
# replays schema and historical ETL. Never invoke it on an operational site.
if [[ "${HG_ALLOW_INITIAL_INSTALL:-}" != "EMPTY_DATABASE_ONLY" ]]; then
  echo 'INSTALL_BLOCKED: install-private.sh is an initial installer, not an update command.' >&2
  echo 'No database, container or file changes performed. Use the reviewed update runbook.' >&2
  exit 64
fi

release="${HG_RELEASE_DIR:-$HOME/hollowgate-private-upload/hollowgate-aruba-production-linux}"
container="${HG_POSTGRES_CONTAINER:-hollowgate-postgres-1}"
database="${HG_POSTGRES_DATABASE:-hollowgate}"
owner="${HG_POSTGRES_USER:-hollowgate}"
backup="${HG_VERIFIED_BACKUP:-/opt/hollowgate/data/backups/hollowgate-20261118T110801Z.dump}"
image="hollowgate-aruba-production-api:private-candidate"
migration_image="hollowgate-aruba-production-migration:private-candidate"
project="hollowgate-production-private"

test -d "$release"
test -s "$backup"
cd "$release"
sha256sum -c SHA256SUMS >/dev/null

sql_files=(
 database/sql/001_auth_foundation.sql
 database/sql/002_auth_sessions.sql
 database/sql/003_password_actions.sql
 database/sql/004_auth_rate_limits.sql
 database/sql/005_auth_runtime_role.sql
 database/sql/006_password_reset_runtime.sql
 database/sql/007_signup_verification.sql
 database/sql/008_vtt_campaigns.sql
 database/sql/009_vtt_campaign_updates.sql
 database/sql/010_vtt_character_drafts.sql
 database/sql/011_vtt_character_sheets.sql
 database/sql/012_vtt_character_archive.sql
 database/sql/013_vtt_entity_notes.sql
 database/sql/014_vtt_note_subtabs.sql
 database/sql/015_vtt_campaign_notes.sql
 database/sql/016_vtt_campaign_members.sql
 database/sql/017_vtt_campaign_note_folders.sql
 database/sql/018_vtt_campaign_note_folders_link.sql
 database/sql/019_vtt_campaign_note_folder_actions.sql
 database/sql/020_vtt_campaign_note_ui_read.sql
 database/sql/021_vtt_campaign_note_member_writes.sql
 database/sql/022_vtt_campaign_note_subtab_permissions.sql
 database/sql/023_vtt_campaign_note_title_order.sql
 database/sql/024_vtt_campaign_note_scope_transitions.sql
 database/sql/025_vtt_campaign_note_trash_restore.sql
 database/sql/026_vtt_campaign_roster.sql
 database/sql/027_vtt_character_availability.sql
 database/sql/028_vtt_character_player_assignments.sql
 database/sql/029_vtt_player_character_read.sql
 database/sql/030_vtt_joined_player_campaigns.sql
 database/sql/031_vtt_character_portraits.sql
 database/sql/032_vtt_character_portrait_sources.sql
 database/sql/033_vtt_campaign_invites.sql
 database/sql/034_vtt_character_claims.sql
 database/sql/campaign-documents/001_campaign_documents.sql
 database/sql/campaign-documents/002_session_document_keys.sql
 database/sql/chapters/001_chapter_documents.sql
 database/sql/scenes/001_scene_documents.sql
 database/sql/visual-assets/001_visual_assets.sql
 database/sql/visual-assets/002_visual_asset_content.sql
 database/sql/visual-assets/003_player_visual_asset_read.sql
 database/sql/visual-assets/004_campaign_branding.sql
 database/sql/narrative/001_narrative_content.sql
 database/sql/narrative/002_narrative_entity_notes.sql
 database/sql/narrative/003_locations.sql
 database/sql/equipment/001_equipment_catalog.sql
 database/sql/chat/001_campaign_chat.sql
 database/sql/chat/002_chat_attachments.sql
 database/sql/dice/001_dice_formulas.sql
 database/sql/migration/001_source_records.sql
 database/sql/migration/002_lossless_note_bounds.sql
 database/sql/migration/003_lossless_note_function_bounds.sql
)

echo '1/7 Building private candidate image...'
sudo docker build --progress=plain -t "$image" apps/aruba-api
cat > Dockerfile.migration-private <<EOF
FROM $image
USER root
COPY migration/scripts/migrate-to-aruba-schema.mjs /app/migrate.mjs
COPY migration/scripts/verify-migration.mjs /app/verify.mjs
COPY migration/data /release/migration/data
RUN chmod -R a+rX /release /app/migrate.mjs /app/verify.mjs
USER 1001:1001
EOF
sudo docker build --progress=plain -f Dockerfile.migration-private -t "$migration_image" .

echo '2/7 Applying ordered PostgreSQL schema...'
for file in "${sql_files[@]}"; do
  echo "  $file"
  sudo docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$owner" -d "$database" < "$file"
done

echo '3/7 Running lossless ETL...'
migration_container="hg-aruba-migration-private-$$"
sudo docker create --name "$migration_container" --network bridge --cap-drop ALL --security-opt no-new-privileges:true \
  -v /opt/hollowgate/config/postgres_password:/run/secrets/db_password:ro \
  --entrypoint /bin/sh "$migration_image" -c '
    set -eu
    export SOURCE_EXPORT_PATH=/release/migration/data/supabase-export.json
    export BINARY_ASSET_DIR=/release/migration/data/binary-assets
    export PGHOST=postgres PGPORT=5432 PGDATABASE=hollowgate PGUSER=hollowgate
    export PGPASSWORD="$(cat /run/secrets/db_password)"
    node /app/migrate.mjs
  '
sudo docker network connect hollowgate-db "$migration_container"
if ! sudo docker start -a "$migration_container"; then
  sudo docker rm -f "$migration_container" >/dev/null 2>&1 || true
  exit 1
fi
sudo docker rm "$migration_container" >/dev/null

echo '4/7 Verifying exact source ledger and binaries...'
sudo docker run --rm --network hollowgate-db --cap-drop ALL --security-opt no-new-privileges:true \
  -v /opt/hollowgate/config/postgres_password:/run/secrets/db_password:ro \
  --entrypoint /bin/sh "$migration_image" -c '
    set -eu
    export SOURCE_EXPORT_PATH=/release/migration/data/supabase-export.json
    export PGHOST=postgres PGPORT=5432 PGDATABASE=hollowgate PGUSER=hollowgate
    export PGPASSWORD="$(cat /run/secrets/db_password)"
    node /app/verify.mjs
  '

echo '5/7 Provisioning restricted production principal and secrets...'
secret_dir="$release/secrets"
config_dir="$release/config"
mkdir -p "$secret_dir" "$config_dir"
if [[ ! -s /opt/hollowgate/config/auth_app_db_password ]]; then
  openssl rand -base64 48 > /tmp/hg-auth-app-password.$$
  sudo install -o hgadmin -g hgadmin -m 600 /tmp/hg-auth-app-password.$$ /opt/hollowgate/config/auth_app_db_password
  rm -f /tmp/hg-auth-app-password.$$
fi
app_password="$(cat /opt/hollowgate/config/auth_app_db_password)"
printf "ALTER ROLE hollowgate_auth_app WITH LOGIN INHERIT PASSWORD '%s'; GRANT hollowgate_api_runtime TO hollowgate_auth_app;\n" "$app_password" |
  sudo docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$owner" -d "$database"
unset app_password
install -o hgadmin -g hgadmin -m 600 /opt/hollowgate/config/auth_app_db_password "$secret_dir/postgres_password"
install -o hgadmin -g hgadmin -m 600 /opt/hollowgate/config/auth_rate_limit_key "$secret_dir/auth_hmac_key"
install -o hgadmin -g hgadmin -m 600 /opt/hollowgate/config/resend_api_key "$secret_dir/resend_api_key"
cp production.env.example "$config_dir/production.env"
chmod 600 "$config_dir/production.env"

echo '6/7 Preparing isolated loopback compose...'
sed 's/127.0.0.1:3002:3000/127.0.0.1:3004:3000/' compose.production.yaml > compose.private.yaml
sudo docker compose -p "$project" -f compose.private.yaml config >/dev/null
sudo docker compose -p "$project" -f compose.private.yaml up -d --build
sudo docker network connect bridge "$project-aruba-api-1" 2>/dev/null || true
sudo docker restart "$project-aruba-api-1" >/dev/null

echo '7/7 Checking private readiness...'
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3004/ready >/dev/null; then
    curl -fsS http://127.0.0.1:3004/health
    echo
    curl -fsS http://127.0.0.1:3004/ready
    echo
    echo PRIVATE_INSTALL_OK
    exit 0
  fi
  sleep 1
done
sudo docker compose -p "$project" -f compose.private.yaml logs --tail=50 aruba-api >&2
exit 1
