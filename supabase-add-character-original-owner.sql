-- "Rilascia" robusto indipendentemente dallo stato di assegnazione a una
-- campagna: original_owner_profile_id registra il GM a cui il PG va
-- restituito, valorizzato una sola volta al momento del claim (in
-- /characters/:id/claim) e mai piu' toccato da assign-campaign/unassign/
-- remove-player - stesso pattern di claimable_origin (si accende una volta,
-- non si spegne/sovrascrive mai piu').
--
-- A differenza di derivare il GM da campaign_id -> campaigns.owner_profile_id
-- (il meccanismo precedente), questo campo sopravvive anche se il PG lascia
-- la campagna (rimozione volontaria del giocatore o rimozione del giocatore
-- da parte del GM), che azzerano campaign_id ma non toccano questo campo.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- E' idempotente: se la colonna esiste già non fa nulla.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS original_owner_profile_id TEXT;
