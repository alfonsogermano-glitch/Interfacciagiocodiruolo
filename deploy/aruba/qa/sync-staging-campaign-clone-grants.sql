-- CLONE ONLY: copy function/schema ACLs locally, never provision or alter roles.
-- This is NOT 037 and does not weaken its hollowgate_auth_test database guard.
DO $$
DECLARE grant_row record;
BEGIN
  IF current_database() <> 'hollowgate_stage_campaign_verify_20261121' THEN
    RAISE EXCEPTION 'Wrong recovery clone database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hollowgate_auth_staging_app'
    AND rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Restricted staging role missing or unsafe';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member='hollowgate_auth_staging_app'::regrole) THEN
    RAISE EXCEPTION 'Staging role must not belong to shared groups';
  END IF;
  FOR grant_row IN
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname IN ('hollowgate_auth','hollowgate_vtt') AND p.prokind='f'
      AND acl.grantee='hollowgate_api_runtime'::regrole AND acl.privilege_type='EXECUTE'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO hollowgate_auth_staging_app',
      grant_row.nspname,grant_row.proname,grant_row.args);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA hollowgate_auth,hollowgate_vtt TO hollowgate_auth_staging_app;
