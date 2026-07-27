-- Visibilita' per-nota "solo creatore+GM" dentro Note della Campagna, piu'
-- il tracciamento del creatore necessario per abilitare i giocatori a
-- creare/modificare/eliminare le PROPRIE note (oggi solo il GM puo' scrivere
-- su entity_notes con entity_type='campaign', vedi canAccessEntityNotes in
-- supabase/functions/server/index.tsx - nessuna colonna esistente puo' dire
-- "chi ha creato questa nota", quindi owner_profile_id e' indispensabile,
-- non solo comodo).
--
-- Distinto da `hidden` (che resta a livello di SEZIONE: Note del GM vs Note
-- della Campagna, vedi supabase-add-notes-folders.sql) - `visibility` e' un
-- asse ortogonale, a livello di SINGOLA nota dentro la sezione Campagna.
--
-- Enum testuale invece di un secondo booleano: piu' leggibile del
-- combinarsi di hidden+privateFlag, estensibile senza altra migration se in
-- futuro servisse un terzo livello (es. "visibile a un sottoinsieme di
-- membri").
--
-- Nessun backfill: le righe esistenti restano con owner_profile_id NULL
-- (nessun creatore noto, comportamento identico a oggi - solo il GM puo'
-- modificarle/eliminarle) e visibility='all' (default, invariato per il
-- pregresso). Nessuna assunzione su dati gia' presenti.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table entity_notes add column if not exists owner_profile_id text;

alter table entity_notes add column if not exists visibility text not null default 'all';

alter table entity_notes drop constraint if exists entity_notes_visibility_check;
alter table entity_notes add constraint entity_notes_visibility_check
  check (visibility = any (array['all'::text, 'private'::text]));

create index if not exists idx_entity_notes_owner on entity_notes(owner_profile_id);
