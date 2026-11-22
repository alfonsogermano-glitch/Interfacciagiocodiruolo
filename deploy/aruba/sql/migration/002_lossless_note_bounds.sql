-- Real exported TipTap documents exceed the original 48 KiB staging limit.
-- Preserve them without truncation while retaining a strict 1 MiB ceiling.
BEGIN;
ALTER TABLE hollowgate_vtt.entity_notes
 DROP CONSTRAINT IF EXISTS entity_notes_content_rich_check,
 ADD CONSTRAINT entity_notes_content_rich_check CHECK(
  content_rich IS NULL OR(jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=1048576));
ALTER TABLE hollowgate_vtt.campaign_notes
 DROP CONSTRAINT IF EXISTS campaign_notes_content_rich_check,
 ADD CONSTRAINT campaign_notes_content_rich_check CHECK(
  content_rich IS NULL OR(jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=1048576));
ALTER TABLE hollowgate_vtt.narrative_entity_notes
 DROP CONSTRAINT IF EXISTS narrative_entity_notes_content_rich_check,
 ADD CONSTRAINT narrative_entity_notes_content_rich_check CHECK(
  content_rich IS NULL OR(jsonb_typeof(content_rich)='object' AND octet_length(content_rich::text)<=1048576));
COMMIT;
