-- "Precompilati": PG creati normalmente dal GM, marcati disponibili per i
-- giocatori nella campagna. available_for_players si accende/spegne (GM
-- lo marca disponibile, un giocatore lo richiede -> torna false).
-- claimable_origin si accende la prima volta che il GM lo marca disponibile
-- e non viene mai piu' resettato: distingue un PG "nato precompilato" (che
-- un giocatore puo' poi rilasciare al GM) da un PG creato da zero da un
-- giocatore (che non deve mai mostrare l'opzione "Rilascia").
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- E' idempotente: se le colonne esistono già non fa nulla.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS available_for_players BOOLEAN DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS claimable_origin BOOLEAN DEFAULT false;
