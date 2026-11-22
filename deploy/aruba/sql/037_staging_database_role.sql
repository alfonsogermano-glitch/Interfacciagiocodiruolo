-- Run ONLY while connected to hollowgate_auth_test as its owner, inside
-- psql --single-transaction -v ON_ERROR_STOP=1. No password is assigned.
-- The login never inherits hollowgate_api_runtime: that shared group also
-- holds grants in the production database. Copy its effective, explicit ACLs
-- only in THIS database. Re-run after installing later staging-only migrations.
DO $$
BEGIN
  IF current_database() <> 'hollowgate_auth_test' THEN
    RAISE EXCEPTION 'Dedicated staging role requires hollowgate_auth_test';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hollowgate_api_runtime') THEN
    RAISE EXCEPTION 'Runtime role missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hollowgate_auth_staging_app') THEN
    CREATE ROLE hollowgate_auth_staging_app LOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='hollowgate_auth_staging_app'
      AND (NOT rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Staging login has unexpected role attributes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m
    WHERE m.member='hollowgate_auth_staging_app'::regrole
  ) THEN
    RAISE EXCEPTION 'Staging login must not belong to any shared group';
  END IF;
END $$;

GRANT CONNECT ON DATABASE hollowgate_auth_test TO hollowgate_auth_staging_app;

DO $$
DECLARE grant_row record;
BEGIN
  -- The role receives no CREATE privilege and no grant in any other database.
  FOR grant_row IN
    SELECT n.nspname, acl.privilege_type
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) acl
    WHERE n.nspname IN ('hollowgate_auth','hollowgate_vtt')
      AND acl.grantee='hollowgate_api_runtime'::regrole
  LOOP
    EXECUTE format('GRANT %s ON SCHEMA %I TO hollowgate_auth_staging_app',
      grant_row.privilege_type,grant_row.nspname);
  END LOOP;

  FOR grant_row IN
    SELECT n.nspname,c.relname,acl.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) acl
    WHERE n.nspname IN ('hollowgate_auth','hollowgate_vtt')
      AND c.relkind IN ('r','p','v','m','f')
      AND acl.grantee='hollowgate_api_runtime'::regrole
  LOOP
    EXECUTE format('GRANT %s ON TABLE %I.%I TO hollowgate_auth_staging_app',
      grant_row.privilege_type,grant_row.nspname,grant_row.relname);
  END LOOP;

  FOR grant_row IN
    SELECT n.nspname,c.relname,a.attname,acl.privilege_type
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) acl
    WHERE n.nspname IN ('hollowgate_auth','hollowgate_vtt')
      AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
      AND acl.grantee='hollowgate_api_runtime'::regrole
  LOOP
    EXECUTE format('GRANT %s (%I) ON TABLE %I.%I TO hollowgate_auth_staging_app',
      grant_row.privilege_type,grant_row.attname,grant_row.nspname,grant_row.relname);
  END LOOP;

  FOR grant_row IN
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
      acl.privilege_type
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl
    WHERE n.nspname IN ('hollowgate_auth','hollowgate_vtt')
      AND p.prokind='f'
      AND acl.grantee='hollowgate_api_runtime'::regrole
  LOOP
    EXECUTE format('GRANT %s ON FUNCTION %I.%I(%s) TO hollowgate_auth_staging_app',
      grant_row.privilege_type,grant_row.nspname,grant_row.proname,grant_row.args);
  END LOOP;
END $$;
