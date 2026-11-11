\set ON_ERROR_STOP on
BEGIN;
-- No real accounts; all mutations are rolled back.
CREATE TEMP TABLE local_signup_test(tok bytea);
INSERT INTO local_signup_test(tok) VALUES(decode(repeat('af',32),'hex'));

SET LOCAL ROLE hollowgate_api_runtime;
DO $$
DECLARE first boolean; again boolean; verified boolean; replay boolean;
BEGIN
  first:=hollowgate_auth.register_local_user(
    'signup-fixture@example.invalid','Signup fixture',
    '$argon2id$v=19$m=19456,t=2,p=1$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzabcdefghi',
    decode(repeat('af',32),'hex'));
  IF NOT first THEN RAISE EXCEPTION 'Initial registration failed'; END IF;
  again:=hollowgate_auth.register_local_user(
    'signup-fixture@example.invalid','Second name',
    '$argon2id$v=19$m=19456,t=2,p=1$abcdefghijklmnopqrstuv$abcdefghijklmnopqrstuvwxyzabcdefghi',
    decode(repeat('bf',32),'hex'));
  IF again THEN RAISE EXCEPTION 'Duplicate registration changed identity'; END IF;
  verified:=hollowgate_auth.confirm_local_email(decode(repeat('af',32),'hex'));
  replay:=hollowgate_auth.confirm_local_email(decode(repeat('af',32),'hex'));
  IF NOT verified OR replay THEN RAISE EXCEPTION 'Single-use verification failed'; END IF;
  IF EXISTS(
    SELECT 1 FROM hollowgate_auth.users
    WHERE email='signup-fixture@example.invalid'
      AND (status<>'active' OR email_verified_at IS NULL OR source<>'local')
  ) THEN RAISE EXCEPTION 'Unexpected user state'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM hollowgate_auth.user_roles r
    JOIN hollowgate_auth.users u ON r.user_id=u.id
    WHERE u.email='signup-fixture@example.invalid' AND r.role='standard'
  ) THEN RAISE EXCEPTION 'Missing standard role'; END IF;
  IF has_table_privilege(current_user,'hollowgate_auth.users','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.users','INSERT') OR
     has_table_privilege(current_user,'hollowgate_auth.email_verifications','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.user_roles','UPDATE') THEN
    RAISE EXCEPTION 'Runtime has direct identity modification permission'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'SIGNUP_EMAIL_VERIFICATION_SUCCESS' AS result;
