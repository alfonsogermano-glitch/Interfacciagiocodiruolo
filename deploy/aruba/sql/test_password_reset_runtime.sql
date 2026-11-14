\set ON_ERROR_STOP on
BEGIN;
-- Role privileges are checked only after migration 006, on a disposable DB.
SET LOCAL ROLE hollowgate_api_runtime;
DO $$
BEGIN
  IF NOT has_column_privilege(current_user,'hollowgate_auth.password_actions','token_hash','SELECT') OR
     NOT has_column_privilege(current_user,'hollowgate_auth.password_actions','consumed_at','UPDATE') OR
     NOT has_column_privilege(current_user,'hollowgate_auth.password_credentials','password_hash','UPDATE') THEN
    RAISE EXCEPTION 'Missing reset privileges';
  END IF;
  IF has_table_privilege(current_user,'hollowgate_auth.users','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.user_roles','UPDATE') OR
     has_table_privilege(current_user,'hollowgate_auth.password_actions','DELETE') OR
     has_table_privilege(current_user,'hollowgate_auth.sessions','DELETE') THEN
    RAISE EXCEPTION 'Reset privilege escalation';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASSWORD_RESET_ROLE_TEST_SUCCESS' AS result;
