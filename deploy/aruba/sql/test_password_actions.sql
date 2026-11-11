\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hollowgate_auth.users (id,email,display_name)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','reset@example.org','Reset test user');

INSERT INTO hollowgate_auth.password_actions(user_id,purpose,token_hash,expires_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','password_setup',decode(repeat('ab',32),'hex'),now() + interval '30 minutes');

DO $$
DECLARE claimed integer;
BEGIN
  UPDATE hollowgate_auth.password_actions
     SET consumed_at = now()
   WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     AND token_hash = decode(repeat('ab',32),'hex')
     AND purpose = 'password_setup'
     AND consumed_at IS NULL
     AND expires_at > now();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 1 THEN RAISE EXCEPTION 'Valid one-time token not claimed'; END IF;

  UPDATE hollowgate_auth.password_actions
     SET consumed_at = now()
   WHERE user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     AND token_hash = decode(repeat('ab',32),'hex')
     AND consumed_at IS NULL
     AND expires_at > now();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 0 THEN RAISE EXCEPTION 'Replay accepted'; END IF;
END $$;

INSERT INTO hollowgate_auth.password_actions(user_id,purpose,token_hash,expires_at)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','password_reset',decode(repeat('bc',32),'hex'),now() + interval '1 second');
UPDATE hollowgate_auth.password_actions
SET created_at = now() - interval '2 minutes',
    expires_at = now() - interval '1 minute'
WHERE token_hash = decode(repeat('bc',32),'hex');

DO $$
DECLARE claimed integer;
BEGIN
  UPDATE hollowgate_auth.password_actions
     SET consumed_at = now()
   WHERE token_hash = decode(repeat('bc',32),'hex')
     AND consumed_at IS NULL
     AND expires_at > now();
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed <> 0 THEN RAISE EXCEPTION 'Expired token accepted'; END IF;

  BEGIN
    INSERT INTO hollowgate_auth.password_actions(user_id,purpose,token_hash,expires_at)
    VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','password_reset',decode('cd','hex'),now() + interval '10 minutes');
    RAISE EXCEPTION 'Short token digest accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO hollowgate_auth.password_actions(user_id,purpose,token_hash,expires_at)
    VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','password_reset',decode(repeat('de',32),'hex'),now() + interval '2 hours');
    RAISE EXCEPTION 'Overlong reset lifetime accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  IF has_table_privilege('public', 'hollowgate_auth.password_actions', 'SELECT') THEN
    RAISE EXCEPTION 'Reset token digests must remain private';
  END IF;
END $$;
ROLLBACK;
