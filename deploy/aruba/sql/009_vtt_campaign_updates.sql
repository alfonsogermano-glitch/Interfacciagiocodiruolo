-- 009: metadata-only update for campaigns owned by the authenticated Aruba user.
-- Executed only against the dedicated staging database, never Supabase or real accounts.
BEGIN;
CREATE OR REPLACE FUNCTION hollowgate_vtt.update_owned_campaign(
  p_owner uuid,p_campaign uuid,p_name text,p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_owner IS NULL OR p_campaign IS NULL OR
    p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR
    p_description IS NULL OR length(p_description)>4000 THEN
    RAISE EXCEPTION 'Invalid campaign edit' USING ERRCODE='22023';
  END IF;
  UPDATE hollowgate_vtt.campaigns c
  SET name=btrim(p_name),description=p_description,updated_at=now()
  WHERE c.id=p_campaign AND c.owner_id=p_owner
    AND EXISTS (SELECT 1 FROM hollowgate_auth.users u WHERE u.id=p_owner
      AND u.status='active' AND u.email_verified_at IS NOT NULL)
  RETURNING c.id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION hollowgate_vtt.update_owned_campaign(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_vtt.update_owned_campaign(uuid,uuid,text,text) TO hollowgate_api_runtime;
COMMIT;
