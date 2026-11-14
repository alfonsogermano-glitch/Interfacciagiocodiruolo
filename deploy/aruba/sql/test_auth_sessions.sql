\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hollowgate_auth.users(id,email,display_name)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','session@example.org','Session user');

INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  decode(repeat('aa',32),'hex'),
  now() + interval '1 day'
);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM hollowgate_auth.sessions
    WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND revoked_at IS NULL
      AND expires_at > now();
  IF n <> 1 THEN RAISE EXCEPTION 'Active session missing'; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', decode('aa','hex'), now() + interval '1 day');
    RAISE EXCEPTION 'Short digest unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', decode(repeat('bb',32),'hex'), now() - interval '1 day');
    RAISE EXCEPTION 'Expired-at-creation session unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', decode(repeat('aa',32),'hex'), now() + interval '1 day');
    RAISE EXCEPTION 'Duplicate digest unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;

UPDATE hollowgate_auth.sessions SET revoked_at = now()
WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM hollowgate_auth.sessions
  WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND revoked_at IS NULL;
  IF n <> 0 THEN RAISE EXCEPTION 'Revocation failed'; END IF;
  IF has_table_privilege('public','hollowgate_auth.sessions','SELECT') THEN
    RAISE EXCEPTION 'Session table must remain private';
  END IF;
END $$;
ROLLBACK;
