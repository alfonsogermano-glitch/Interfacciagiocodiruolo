-- =====================================================
-- ESTENSIONE chat_messages: timeline unificata
-- La chat salva tutto: messaggi di testo, tiri di dado e
-- in futuro gli allegati. kind distingue il tipo di voce,
-- payload conserva il tiro completo (RollResult) in JSON.
-- =====================================================

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'message';

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign_created
  ON chat_messages(campaign_id, created_at);
