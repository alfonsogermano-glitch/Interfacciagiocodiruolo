\set ON_ERROR_STOP on
BEGIN;

-- Seed only disposable fixtures as database owner.
INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','permissions@example.org','Permissions test','active',now());
INSERT INTO hollowgate_auth.user_roles(user_id,role)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','standard');
INSERT INTO hollowgate_auth.password_credentials(user_id,password_hash)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '$argon2id$v=19$m=19456,t=2,p=1$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzabcdefghi');

SET LOCAL ROLE hollowgate_api_runtime;

-- These statements must succeed as the restricted runtime identity.
SELECT id, email, status, email_verified_at FROM hollowgate_auth.users
WHERE email='permissions@example.org';
SELECT user_id, role FROM hollowgate_auth.user_roles
WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT user_id, password_hash FROM hollowgate_auth.password_credentials
WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';

INSERT INTO hollowgate_auth.sessions(user_id,token_hash,expires_at)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  decode(repeat('ee',32),'hex'),now()+interval '1 hour');
SELECT user_id FROM hollowgate_auth.sessions
WHERE token_hash=decode(repeat('ee',32),'hex');
UPDATE hollowgate_auth.sessions SET revoked_at=now()
WHERE token_hash=decode(repeat('ee',32),'hex') AND revoked_at IS NULL
RETURNING user_id;

INSERT INTO hollowgate_auth.rate_limit_buckets(action,subject_digest,window_start,hits)
VALUES('login',decode(repeat('aa',32),'hex'),date_trunc('minute',now()),1)
ON CONFLICT (action,subject_digest,window_start)
DO UPDATE SET hits=hollowgate_auth.rate_limit_buckets.hits+1,updated_at=now()
RETURNING hits;
INSERT INTO hollowgate_auth.rate_limit_buckets(action,subject_digest,window_start,hits)
VALUES('login',decode(repeat('aa',32),'hex'),date_trunc('minute',now()),1)
ON CONFLICT (action,subject_digest,window_start)
DO UPDATE SET hits=hollowgate_auth.rate_limit_buckets.hits+1,updated_at=now()
RETURNING hits;

-- Use privilege checks plus actual negative SQL execution.
DO $$
BEGIN
  IF has_table_privilege(current_user,'hollowgate_auth.users','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.user_roles','INSERT') OR
     has_table_privilege(current_user,'hollowgate_auth.password_credentials','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.password_actions','SELECT') OR
     has_table_privilege(current_user,'hollowgate_auth.sessions','DELETE') OR
     has_schema_privilege(current_user,'hollowgate_auth','CREATE') THEN
    RAISE EXCEPTION 'Runtime role unexpectedly has privileged permissions';
  END IF;

  BEGIN
    UPDATE hollowgate_auth.user_roles SET role='admin'
    WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    RAISE EXCEPTION 'Runtime user was allowed to escalate privileges';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE hollowgate_auth.sessions SET token_hash=decode(repeat('ff',32),'hex')
    WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    RAISE EXCEPTION 'Runtime user was allowed to overwrite session token digests';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    CREATE TABLE hollowgate_auth.hijack_attempt(id int);
    RAISE EXCEPTION 'Runtime user was allowed to create schema objects';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

RESET ROLE;
ROLLBACK;
