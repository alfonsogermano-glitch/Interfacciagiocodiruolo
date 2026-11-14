-- Staging-only least-privilege privileges for password-reset rehearsal.
-- NOT automatically applied; never run on production or Supabase.
BEGIN;
GRANT SELECT (id,user_id,purpose,token_hash,expires_at,consumed_at)
 ON hollowgate_auth.password_actions TO hollowgate_api_runtime;
GRANT INSERT (user_id,purpose,token_hash,expires_at)
 ON hollowgate_auth.password_actions TO hollowgate_api_runtime;
GRANT UPDATE (consumed_at) ON hollowgate_auth.password_actions TO hollowgate_api_runtime;
GRANT INSERT (user_id,password_hash) ON hollowgate_auth.password_credentials TO hollowgate_api_runtime;
GRANT UPDATE (password_hash,changed_at) ON hollowgate_auth.password_credentials TO hollowgate_api_runtime;
COMMIT;
