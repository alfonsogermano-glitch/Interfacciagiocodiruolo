\set ON_ERROR_STOP on
BEGIN;
INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','session2@example.org','Tester','active',now());

INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',decode(repeat('dd',32),'hex'),now()+interval '1 hour');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM hollowgate_auth.sessions s
  JOIN hollowgate_auth.users u ON u.id=s.user_id
  WHERE s.token_hash=decode(repeat('dd',32),'hex')
    AND s.revoked_at IS NULL AND s.expires_at>now()
    AND u.status='active' AND u.email_verified_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'Live session lookup failed'; END IF;
END $$;

UPDATE hollowgate_auth.sessions SET revoked_at=now()
WHERE token_hash=decode(repeat('dd',32),'hex')
  AND revoked_at IS NULL AND expires_at>now();

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM hollowgate_auth.sessions
  WHERE token_hash=decode(repeat('dd',32),'hex')
    AND revoked_at IS NULL AND expires_at>now();
  IF n <> 0 THEN RAISE EXCEPTION 'Revoked session still valid'; END IF;
END $$;
ROLLBACK;
