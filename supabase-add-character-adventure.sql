-- PG: aggiunge adventure_id ai personaggi, stesso concetto gia' presente su
-- npcs/monsters/environments/situations (Ambito narrativo: "tutta la
-- campagna" se NULL, altrimenti una specifica avventura della campagna).
-- Idempotente, puo' essere rieseguito senza effetti collaterali.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table characters
  add column if not exists adventure_id uuid references adventures(id) on delete set null;

create index if not exists idx_characters_adventure on characters(adventure_id);
