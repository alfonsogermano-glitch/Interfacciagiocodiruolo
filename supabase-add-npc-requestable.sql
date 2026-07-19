-- Predispone il campo per "Richiedibile" (PNG che un giocatore potra' un
-- giorno richiedere come proprio PG), oggi disabilitato in UI per qualsiasi
-- ruleset (vedi il commento sulla voce menu 'requestable' in
-- MyCharactersPage.tsx) - il campo resta sempre false finche' la feature
-- non viene costruita per un ruleset diverso da HSC. Aggiunto ora solo per
-- evitare una seconda migrazione quando si sbloccherà.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- E' idempotente: se la colonna esiste già non fa nulla.

ALTER TABLE npcs ADD COLUMN IF NOT EXISTS requestable BOOLEAN DEFAULT false;
