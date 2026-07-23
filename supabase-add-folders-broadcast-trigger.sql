-- Realtime per la tabella folders - bug trovato il 2026-07-23: le modifiche
-- a cartelle fatte da SessionCharactersPanel.tsx (in sessione) non si
-- riflettevano in tempo reale su CampaignHome.tsx (schermata Campagna), e
-- viceversa. characters/npcs/monsters/entity_notes hanno gia' ciascuna un
-- trigger di broadcast (characters_broadcast_trigger, npcs_broadcast_trigger,
-- monsters_broadcast_trigger, entity_notes_broadcast_trigger) sulla stessa
-- funzione condivisa characters_broadcast_changes() - folders (aggiunta in
-- supabase-add-folders.sql, Fase 0 della feature cartelle) non ne aveva mai
-- avuto uno, unica tabella coinvolta nel sistema cartelle esclusa dal
-- meccanismo. Confermato via query diretta sui trigger esistenti
-- (characters_broadcast_changes() usa topic campaign:{campaign_id},
-- evento = TG_OP, NEW/OLD come record - folders ha gia' la colonna
-- campaign_id diretta sulla riga, nessun adattamento alla funzione
-- necessario).
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

create trigger folders_broadcast_trigger
  after insert or update or delete on folders
  for each row execute function characters_broadcast_changes();
