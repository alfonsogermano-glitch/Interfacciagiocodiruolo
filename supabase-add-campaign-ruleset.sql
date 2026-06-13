-- Aggiunge la colonna `ruleset` alla tabella campaigns, usata dal
-- sistema di sincronizzazione campagne (ensureCampaignExistsInDB) per
-- salvare il regolamento (HSC, D&D 5e, ecc.) della campagna creata
-- dalla HomeScreen.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- E' idempotente: se la colonna esiste già non fa nulla.

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ruleset TEXT;
