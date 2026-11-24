-- Read-only projection of native entries assigned to a campaign. No mutation
-- anywhere; campaign authorization reuses the assignment contract.
BEGIN;
CREATE FUNCTION hollowgate_vtt.list_native_catalog_entries_by_campaign(p_actor uuid,p_kind text,p_campaign uuid)
RETURNS TABLE(item jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
SELECT hollowgate_vtt.catalog_entity_document(e) FROM hollowgate_vtt.catalog_entities e
WHERE e.kind=p_kind AND e.campaign_id=p_campaign
  AND hollowgate_vtt.native_catalog_context_authorized(p_actor,p_campaign)
ORDER BY e.id LIMIT 101
$$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_native_catalog_entries_by_campaign(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_native_catalog_entries_by_campaign(uuid,text,uuid) TO hollowgate_api_runtime;
COMMIT;
