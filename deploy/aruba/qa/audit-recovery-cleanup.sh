#!/usr/bin/env bash
# Inventory only. No DELETE/UPDATE/DDL, no container lifecycle commands.
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo' >&2; exit 1; }
docker exec -i hollowgate-postgres-1 psql -X -A -t -v ON_ERROR_STOP=1 -U hollowgate -d hollowgate <<'SQL'
BEGIN READ ONLY;
SELECT json_build_object(
 'type','recovery_campaign','id',c.id,'name',c.name,
 'characters',(SELECT count(*) FROM hollowgate_vtt.character_drafts d WHERE d.campaign_id=c.id),
 'nonplaceholder_characters',(SELECT count(*) FROM hollowgate_vtt.character_drafts d
  WHERE d.campaign_id=c.id AND NOT d.sheet_data @> '{"recoveredPlaceholder":true}'),
 'narrative_documents',(SELECT count(*) FROM hollowgate_vtt.narrative_content_documents n WHERE n.campaign_id=c.id),
 'character_notes',(SELECT count(*) FROM hollowgate_vtt.entity_notes n WHERE n.campaign_id=c.id),
 'narrative_notes',(SELECT count(*) FROM hollowgate_vtt.narrative_entity_notes n WHERE n.campaign_id=c.id),
 'campaign_notes',(SELECT count(*) FROM hollowgate_vtt.campaign_notes n WHERE n.campaign_id=c.id)
)
FROM hollowgate_vtt.campaigns c WHERE c.name LIKE '[Recupero]%' ORDER BY c.id;
SELECT json_build_object(
 'type','recovery_character','id',d.id,'campaignId',d.campaign_id,'status',d.status,
 'marked_placeholder',d.sheet_data @> '{"recoveredPlaceholder":true}',
 'notes',(SELECT count(*) FROM hollowgate_vtt.entity_notes n WHERE n.character_id=d.id),
 'sheet_keys',(SELECT json_agg(k ORDER BY k) FROM jsonb_object_keys(d.sheet_data) k)
)
FROM hollowgate_vtt.character_drafts d
WHERE d.name LIKE '[Recupero]%' OR d.sheet_data @> '{"recoveredPlaceholder":true}' ORDER BY d.id;
SELECT json_build_object(
 'type','unnamed_monster','id',d.id,'campaignId',d.campaign_id,
 'marked_placeholder',d.payload @> '{"recoveredPlaceholder":true}',
 'has_title',length(btrim(coalesce(d.payload->>'title','')))>0,
 'notes',(SELECT count(*) FROM hollowgate_vtt.narrative_entity_notes n
  WHERE n.entity_id=d.id AND n.campaign_id=d.campaign_id AND n.kind=d.kind),
 'payload_keys',(SELECT json_agg(k ORDER BY k) FROM jsonb_object_keys(d.payload) k)
)
FROM hollowgate_vtt.narrative_content_documents d
WHERE d.kind='monsters' AND btrim(coalesce(d.payload->>'name',''))='' ORDER BY d.campaign_id,d.id;
SELECT json_build_object('type','chapter_media_summary',
 'chapters',count(*),
 'known_legacy_map_urls',count(*) FILTER(WHERE payload->>'mapUrl' LIKE
  'https://njcnkovruynhtsgzgrxi.supabase.co/storage/v1/object/public/%'))
FROM hollowgate_vtt.chapter_documents;
ROLLBACK;
SQL
echo 'RECOVERY_CLEANUP_AUDIT_OK: read-only; nothing deleted'
