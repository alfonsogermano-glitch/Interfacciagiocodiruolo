#!/usr/bin/env bash
# Read-only inventory; no URLs, image content or note content.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo' >&2; exit 1; }
docker exec -i hollowgate-postgres-1 psql -X -A -t -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate <<'SQL'
BEGIN READ ONLY;
SELECT json_build_object('type','campaign_images','id',c.id,
 'logo_set',c.logo_asset_id IS NOT NULL,'cover_set',c.cover_asset_id IS NOT NULL,
 'source_logo',nullif(m.source_payload->>'logo_url','') IS NOT NULL,
 'source_cover',nullif(m.source_payload->>'cover_image_url','') IS NOT NULL,
 'owner_matches_source',c.owner_id::text=m.source_payload->>'owner_profile_id')
FROM hollowgate_vtt.campaigns c JOIN hollowgate_vtt.migration_source_records m
 ON m.source_table='campaigns' AND m.target_id=c.id::text
WHERE nullif(m.source_payload->>'logo_url','') IS NOT NULL
 OR nullif(m.source_payload->>'cover_image_url','') IS NOT NULL
ORDER BY c.id;
SELECT json_build_object('type','character_images','id',d.id,'campaignId',d.campaign_id,
 'portrait_set',EXISTS(SELECT 1 FROM hollowgate_vtt.character_portraits p WHERE p.character_id=d.id),
 'source_portrait',nullif(d.sheet_data->'sourceRecord'->>'portrait_url','') IS NOT NULL,
 'current_image_keys',(SELECT coalesce(json_agg(k ORDER BY k),'[]'::json)
  FROM jsonb_object_keys(d.sheet_data) k
  WHERE k ~* '(portrait|cover|image)' AND nullif(d.sheet_data->>k,'') IS NOT NULL))
FROM hollowgate_vtt.character_drafts d
WHERE nullif(d.sheet_data->'sourceRecord'->>'portrait_url','') IS NOT NULL
ORDER BY d.id;
SELECT json_build_object('type','narrative_images','kind',d.kind,'id',d.id,'campaignId',d.campaign_id,
 'legacy_keys',(SELECT coalesce(json_agg(k ORDER BY k),'[]'::json)
  FROM jsonb_object_keys(d.payload) k
  WHERE k IN ('portrait_image_url','portrait_cropped_image_url','portrait_source_image_url','cover_image_url','image_url')
   AND nullif(d.payload->>k,'') IS NOT NULL),
 'current_keys',(SELECT coalesce(json_agg(k ORDER BY k),'[]'::json)
  FROM jsonb_object_keys(d.payload) k
  WHERE k IN ('portraitImageUrl','portraitCroppedImageUrl','portraitSourceImageUrl','portraitAssetId','coverImageUrl','imageUrl')
   AND nullif(d.payload->>k,'') IS NOT NULL))
FROM hollowgate_vtt.narrative_content_documents d
WHERE d.kind IN ('npcs','monsters') AND EXISTS (
 SELECT 1 FROM jsonb_each_text(d.payload) e
 WHERE e.key IN ('portrait_image_url','portrait_cropped_image_url','portrait_source_image_url','cover_image_url','image_url')
 AND nullif(e.value,'') IS NOT NULL)
ORDER BY d.kind,d.id;
ROLLBACK;
SQL
echo 'IMAGE_RECOVERY_AUDIT_OK: read-only; nothing changed'
