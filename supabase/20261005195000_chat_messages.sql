-- =====================================================
-- TABELLA: chat_messages
-- Messaggi della chat di sessione, persistiti per campagna.
-- A differenza dei tiri (storico locale), la chat non si cancella:
-- i messaggi restano visibili fino a quando non vengono eliminati
-- singolarmente o l'intera campagna viene rimossa.
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar_url TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign_id ON chat_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- RLS: gli utenti autenticati possono leggere e inserire messaggi.
-- La cancellazione è riservata all'autore del messaggio o al GM della campagna.
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_delete" ON chat_messages;
CREATE POLICY "chat_messages_delete" ON chat_messages
  FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = chat_messages.campaign_id
        AND campaigns.owner_profile_id = auth.uid()::text
    )
  );
