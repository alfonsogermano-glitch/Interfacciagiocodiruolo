-- Aruba-only chapter documents. Apply only after the campaign migration.
-- This migration is additive and does not touch Supabase or Vercel.
BEGIN;
CREATE TABLE IF NOT EXISTS hollowgate_vtt.chapter_documents (
 id uuid NOT NULL,
 campaign_id uuid NOT NULL REFERENCES hollowgate_vtt.campaigns(id) ON DELETE CASCADE,
 payload jsonb NOT NULL,
 PRIMARY KEY (id,campaign_id),
 CONSTRAINT chapter_payload_object CHECK (jsonb_typeof(payload)='object')
);
CREATE INDEX IF NOT EXISTS chapter_documents_campaign_idx
 ON hollowgate_vtt.chapter_documents(campaign_id);
COMMIT;
