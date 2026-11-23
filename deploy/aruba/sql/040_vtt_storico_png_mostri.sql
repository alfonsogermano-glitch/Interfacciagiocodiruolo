-- Storico PNG/Mostri: read-only projection of the old site's npcs/monsters.
-- Historical data has no native-catalog writes; the view is never mutated.
-- Owner: legacy owner_profile_id when present, else the campaign owner
-- (campaigns always carry an owner). NULL-owner + NULL-campaign rows are
-- only for campaignless legacy data and stay readable to active users.
BEGIN;

DROP VIEW IF EXISTS hollowgate_vtt.storico_png_mostri;

CREATE VIEW hollowgate_vtt.storico_png_mostri AS
SELECT 'npcs'::text AS kind,n.id,n.name,n.ruleset,
 CASE WHEN n.owner_profile_id ~ '^[0-9a-fA-F-]{36}$' THEN n.owner_profile_id::uuid END AS owner_profile_id,
 n.campaign_id,n.description,n.notes,n.environment_id,n.chapter_id,n.map_location_id,
 n.image_url,n.cover_image_url,n.created_at,n.updated_at,'npcs'::text AS storico_type
FROM hollowgate_vtt.npcs n
UNION ALL
SELECT 'monsters'::text,m.id,m.name,m.ruleset,
 CASE WHEN m.owner_profile_id ~ '^[0-9a-fA-F-]{36}$' THEN m.owner_profile_id::uuid END,
 m.campaign_id,m.description,m.notes,m.environment_id,m.chapter_id,m.map_location_id,
 m.image_url,m.cover_image_url,m.created_at,m.updated_at,'monsters'::text
FROM hollowgate_vtt.monsters m;

CREATE OR REPLACE FUNCTION hollowgate_vtt.storico_png_mostri_document(p_entry hollowgate_vtt.storico_png_mostri)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT jsonb_build_object('kind',p_entry.kind,'id',p_entry.id,'name',p_entry.name,
 'ruleset',p_entry.ruleset,'ownerProfileId',p_entry.owner_profile_id,'campaignId',p_entry.campaign_id,
 'description',p_entry.description,'notes',p_entry.notes,'environmentId',p_entry.environment_id,
 'chapterId',p_entry.chapter_id,'mapLocationId',p_entry.map_location_id,
 'imageUrl',p_entry.image_url,'coverImageUrl',p_entry.cover_image_url,
 'createdAt',p_entry.created_at,'updatedAt',p_entry.updated_at,
 'storicoType',p_entry.storico_type,'source','storico')
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.storico_png_mostri_access(p_actor uuid,p_owner uuid,p_campaign uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT (p_owner IS NOT NULL AND p_owner=p_actor)
   OR (p_campaign IS NOT NULL AND EXISTS(
    SELECT 1 FROM hollowgate_vtt.campaigns c WHERE c.id=p_campaign AND c.owner_id=p_actor))
   OR (p_owner IS NULL AND p_campaign IS NULL AND EXISTS(
    SELECT 1 FROM hollowgate_auth.users u WHERE u.id=p_actor AND u.status='active' AND u.email_verified_at IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.list_storico_png_mostri(p_actor uuid,p_after uuid)
RETURNS TABLE(item jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT hollowgate_vtt.storico_png_mostri_document(v) FROM hollowgate_vtt.storico_png_mostri v
WHERE hollowgate_vtt.storico_png_mostri_access(p_actor,v.owner_profile_id,v.campaign_id)
  AND (p_after IS NULL OR v.id>p_after) ORDER BY v.id LIMIT 101
$$;

CREATE OR REPLACE FUNCTION hollowgate_vtt.read_storico_png_mostri(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT hollowgate_vtt.storico_png_mostri_document(v) FROM hollowgate_vtt.storico_png_mostri v
WHERE v.id=p_id AND hollowgate_vtt.storico_png_mostri_access(p_actor,v.owner_profile_id,v.campaign_id)
LIMIT 1
$$;

REVOKE ALL ON FUNCTION hollowgate_vtt.storico_png_mostri_document(hollowgate_vtt.storico_png_mostri),
 hollowgate_vtt.storico_png_mostri_access(uuid,uuid,uuid),
 hollowgate_vtt.list_storico_png_mostri(uuid,uuid),
 hollowgate_vtt.read_storico_png_mostri(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.storico_png_mostri_document(hollowgate_vtt.storico_png_mostri),
 hollowgate_vtt.list_storico_png_mostri(uuid,uuid),
 hollowgate_vtt.read_storico_png_mostri(uuid,uuid) TO hollowgate_api_runtime;
COMMIT;
