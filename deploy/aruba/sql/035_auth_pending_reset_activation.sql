BEGIN;
CREATE OR REPLACE FUNCTION hollowgate_auth.activate_pending_reset_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,pg_temp
AS $$
BEGIN
  UPDATE hollowgate_auth.users
  SET status='active',email_verified_at=COALESCE(email_verified_at,now()),updated_at=now()
  WHERE id=p_user AND status='pending_reset';
  IF NOT FOUND THEN RAISE EXCEPTION 'User is not pending reset'; END IF;
END $$;
REVOKE ALL ON FUNCTION hollowgate_auth.activate_pending_reset_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hollowgate_auth.activate_pending_reset_user(uuid) TO hollowgate_api_runtime;
COMMIT;
