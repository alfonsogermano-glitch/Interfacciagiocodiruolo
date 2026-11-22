-- Lossless audit copy of every record imported from the final Supabase export.
-- Application runtime has no access; operational reads use the Aruba tables.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.migration_source_records(
 source_table text NOT NULL,
 source_id text NOT NULL,
 source_ordinal integer NOT NULL CHECK(source_ordinal>=0),
 source_payload jsonb NOT NULL CHECK(jsonb_typeof(source_payload)='object'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[0-9a-f]{64}$'),
 target_table text NOT NULL,
 target_id text NOT NULL,
 migration_note text,
 migrated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(source_table,source_id),
 UNIQUE(source_table,source_ordinal)
);
REVOKE ALL ON hollowgate_vtt.migration_source_records FROM PUBLIC,hollowgate_api_runtime;
COMMIT;
