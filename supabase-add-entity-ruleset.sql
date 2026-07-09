-- Aggiunge il concetto di ruleset per-entità a characters/npcs/monsters,
-- oggi ereditato solo implicitamente dalla campagna. Stesso pattern di
-- campaigns.ruleset (supabase-add-campaign-ruleset.sql): TEXT libero,
-- validato solo lato applicativo da RulesetId, nessun enum/CHECK Postgres.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), in ordine:
-- e' idempotente, puo' essere rieseguito senza effetti collaterali.

-- =====================================================
-- 1) Schema
-- =====================================================
alter table characters add column if not exists ruleset text;
alter table npcs add column if not exists ruleset text;
alter table monsters add column if not exists ruleset text;

-- =====================================================
-- 2) Migrazione dati legacy per i Character
-- =====================================================
-- Verifica preliminare (facoltativa, di sola lettura): quante righe hanno
-- gia' un ruleset scritto dal vecchio flusso HomeScreen.tsx dentro sheet_data,
-- mai promosso a colonna diretta.
--
-- select id, name, sheet_data->>'ruleset' as legacy_ruleset
-- from characters
-- where sheet_data->>'ruleset' is not null;

-- Promuove il valore legacy alla colonna diretta, solo dove ruleset e'
-- ancora NULL (non sovrascrive eventuali dati gia' migrati).
update characters
set ruleset = sheet_data->>'ruleset'
where sheet_data->>'ruleset' is not null
  and ruleset is null;

-- =====================================================
-- 3) Backfill per entita' gia' assegnate a una campagna
-- =====================================================
-- Per le righe con campaign_id valorizzato il ruleset e' deducibile con
-- certezza dalla campagna: popola dove ancora NULL (dopo il punto 2, cosi'
-- il legacy dei Character ha priorita' sul backfill da campagna).
update characters c set ruleset = camp.ruleset
from campaigns camp
where c.campaign_id = camp.id and c.ruleset is null;

update npcs n set ruleset = camp.ruleset
from campaigns camp
where n.campaign_id = camp.id and n.ruleset is null;

update monsters m set ruleset = camp.ruleset
from campaigns camp
where m.campaign_id = camp.id and m.ruleset is null;
