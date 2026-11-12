-- 027: GM-owned pre-made availability; no ownership/claim transfer.
BEGIN;
ALTER TABLE hollowgate_vtt.character_drafts
 ADD COLUMN available_for_players boolean NOT NULL DEFAULT false;
CREATE FUNCTION hollowgate_vtt.list_owned_character_availability(p_owner uuid,p_campaign uuid)
RETURNS TABLE(character_id uuid,available_for_players boolean)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT d.id,d.available_for_players FROM hollowgate_vtt.character_drafts d
 JOIN hollowgate_vtt.campaigns c ON c.id=d.campaign_id AND c.owner_id=p_owner
 JOIN hollowgate_auth.users u ON u.id=p_owner
 WHERE d.campaign_id=p_campaign AND d.owner_id=p_owner AND d.status='active'
 AND u.status='active' AND u.email_verified_at IS NOT NULL
 ORDER BY d.created_at,d.id LIMIT 100
$$;
CREATE FUNCTION hollowgate_vtt.set_owned_character_availability(
 p_owner uuid,p_campaign uuid,p_character uuid,p_available boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 DECLARE v_count bigint:=0;
 BEGIN
 IF p_available IS NULL THEN
  RAISE EXCEPTION 'Availability required' USING ERRCODE='22023';
 END IF;
 UPDATE hollowgate_vtt.character_drafts d
 SET available_for_players=p_available,updated_at=now()
 FROM hollowgate_vtt.campaigns c,hollowgate_auth.users u
 WHERE d.id=p_character AND d.campaign_id=p_campaign AND d.owner_id=p_owner
 AND d.status='active' AND c.id=d.campaign_id AND c.owner_id=p_owner
 AND u.id=p_owner AND u.status='active' AND u.email_verified_at IS NOT NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
 END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.list_owned_character_availability(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION hollowgate_vtt.set_owned_character_availability(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.list_owned_character_availability(uuid,uuid)
 TO hollowgate_api_runtime;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.set_owned_character_availability(uuid,uuid,uuid,boolean)
 TO hollowgate_api_runtime;
COMMIT;
