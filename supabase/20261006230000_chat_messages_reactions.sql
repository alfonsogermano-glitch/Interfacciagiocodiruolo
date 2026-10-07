-- Reazioni emoji ai messaggi chat (una per utente per messaggio).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reactions JSONB;

-- Senza policy UPDATE la scrittura delle reazioni viene respinta dalla RLS
-- in Cloud (in Locale non esiste RLS): tutti i partecipanti autenticati
-- possono aggiornare le reazioni, coerentemente con SELECT/INSERT a true.
DROP POLICY IF EXISTS "chat_messages_update_reactions" ON chat_messages;
CREATE POLICY "chat_messages_update_reactions" ON chat_messages
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
