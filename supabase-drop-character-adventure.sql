-- PG: rimuove adventure_id dai personaggi - decisione presa dopo aver
-- verificato che non esiste (e non e' previsto) un modo per assegnare un PG
-- a un'Avventura specifica: a differenza di npcs/monsters/environments/
-- situations (posizionati dal GM), un PG e' posseduto dal giocatore e vive
-- semplicemente nella campagna. Sostituisce supabase-add-character-
-- adventure.sql (rimosso), che aveva aggiunto la colonna nella Fase A.
--
-- L'indice idx_characters_adventure viene rimosso automaticamente insieme
-- alla colonna (dipendenza implicita di un indice a colonna singola).
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table characters drop column if exists adventure_id;
