\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hollowgate_auth.users (id,email,display_name,source,source_created_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'legacy@example.org', 'Legacy player', 'supabase', now());

DO $$
DECLARE s text; n integer;
BEGIN
  SELECT status INTO s FROM hollowgate_auth.users
  WHERE id = '11111111-1111-4111-8111-111111111111';
  IF s <> 'pending_reset' THEN RAISE EXCEPTION 'Imported users must require password reset'; END IF;

  SELECT count(*) INTO n FROM hollowgate_auth.user_roles;
  IF n <> 0 THEN RAISE EXCEPTION 'No implicit admin or role assignment expected'; END IF;

  SELECT count(*) INTO n FROM hollowgate_auth.password_credentials;
  IF n <> 0 THEN RAISE EXCEPTION 'Credential must not be invented during import'; END IF;

  IF has_schema_privilege('public', 'hollowgate_auth', 'USAGE') THEN
    RAISE EXCEPTION 'Auth schema must not be public';
  END IF;
END $$;

INSERT INTO hollowgate_auth.user_roles(user_id,role)
VALUES ('11111111-1111-4111-8111-111111111111','standard');

DO $$
BEGIN
  BEGIN
    INSERT INTO hollowgate_auth.users(id,email,display_name)
    VALUES ('22222222-2222-4222-8222-222222222222','legacy@example.org','duplicate');
    RAISE EXCEPTION 'duplicate email accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO hollowgate_auth.user_roles(user_id,role)
    VALUES ('11111111-1111-4111-8111-111111111111','owner');
    RAISE EXCEPTION 'unsupported role accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)
    VALUES ('11111111-1111-4111-8111-111111111111','plaintext');
    RAISE EXCEPTION 'plaintext password accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
