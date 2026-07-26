-- Cestino con ripristino per Note della Campagna/GM (note, sotto-tab,
-- cartelle) - scope limitato a entity_notes con entity_type in
-- ('campaign','note') e folders con entity_type in
-- ('gmnotes','campaignnotes'). Le cartelle/tab di PG/PNG/Mostro restano
-- hard-delete, invariate: questa migration aggiunge solo una colonna, non
-- cambia comportamento per nessuna riga esistente ne' per gli altri
-- entity_type (il filtro per tipo vive lato server, non qui).
--
-- Soft-delete invece di una tabella "trash" separata: un UPDATE su una riga
-- esistente arriva gia' gratis al broadcast realtime condiviso
-- (characters_broadcast_changes(), vedi supabase-add-folders-broadcast-
-- trigger.sql, che spara su insert/update/delete) - nessun trigger nuovo
-- necessario.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table entity_notes add column if not exists deleted_at timestamptz;
alter table folders add column if not exists deleted_at timestamptz;

-- Indice parziale (solo righe cestinate): la query piu' frequente su questa
-- colonna e' "elenca cio' che e' in cestino", non un filtro su ogni riga
-- attiva (quelle restano coperte dagli indici/scan gia' esistenti per
-- campaign_id+entity_type).
create index if not exists idx_entity_notes_deleted_at on entity_notes(deleted_at) where deleted_at is not null;
create index if not exists idx_folders_deleted_at on folders(deleted_at) where deleted_at is not null;
