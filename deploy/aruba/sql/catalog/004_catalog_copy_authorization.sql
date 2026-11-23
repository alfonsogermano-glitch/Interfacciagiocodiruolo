-- UNRELEASED. Apply after catalog 001-003, in disposable QA first.
-- Close the v003 target-campaign authorization gap without rewriting sources.
-- No historical backfill, ownership change or automatic runtime activation.
BEGIN;
ALTER FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer)
 RENAME TO copy_unassigned_catalog_to_campaign_v003;
REVOKE ALL ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(uuid,text,uuid,uuid,integer)
 FROM PUBLIC,hollowgate_api_runtime;

CREATE FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(
 p_actor uuid,p_kind text,p_id uuid,p_target_campaign uuid,p_revision integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_source hollowgate_vtt.catalog_entities;v_ruleset text;
BEGIN
 IF NOT hollowgate_vtt.catalog_actor_active(p_actor) THEN RETURN NULL;END IF;
 -- Consistent lock order: source entity first, target campaign second.
 SELECT * INTO v_source FROM hollowgate_vtt.catalog_entities e
 WHERE e.kind=p_kind AND e.id=p_id AND e.owner_id=p_actor AND e.campaign_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT c.ruleset INTO v_ruleset FROM hollowgate_vtt.campaigns c
 WHERE c.id=p_target_campaign AND c.owner_id=p_actor FOR SHARE;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF p_revision IS DISTINCT FROM v_source.revision THEN
  RAISE EXCEPTION 'Catalog revision conflict' USING ERRCODE='40001';END IF;
 IF v_source.ruleset IS NULL OR v_source.ruleset IS DISTINCT FROM v_ruleset THEN
  RAISE EXCEPTION 'Incompatible catalog ruleset' USING ERRCODE='22023';END IF;
 RETURN hollowgate_vtt.copy_unassigned_catalog_to_campaign_v003(
  p_actor,p_kind,p_id,p_target_campaign,p_revision);
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.copy_unassigned_catalog_to_campaign(uuid,text,uuid,uuid,integer) TO hollowgate_api_runtime;
COMMIT;
