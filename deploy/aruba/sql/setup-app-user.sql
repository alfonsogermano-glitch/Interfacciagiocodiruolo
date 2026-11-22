-- Create app user if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hollowgate_auth_app') THEN
    CREATE ROLE hollowgate_auth_app WITH LOGIN PASSWORD 'ci-only-password';
  END IF;
END
$$;

-- Grant permissions on schemas
GRANT USAGE ON SCHEMA hollowgate_auth TO hollowgate_auth_app;
GRANT USAGE ON SCHEMA hollowgate_vtt TO hollowgate_auth_app;

-- Grant permissions on tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hollowgate_auth TO hollowgate_auth_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA hollowgate_vtt TO hollowgate_auth_app;

-- Grant permissions on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hollowgate_auth TO hollowgate_auth_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA hollowgate_vtt TO hollowgate_auth_app;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA hollowgate_auth TO hollowgate_auth_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA hollowgate_vtt TO hollowgate_auth_app;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA hollowgate_auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hollowgate_auth_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA hollowgate_vtt GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hollowgate_auth_app;

SELECT 'App user setup complete' AS status;
