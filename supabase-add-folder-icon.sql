-- Icona personalizzata per cartella (set curato lato client, vedi
-- src/app/components/shared/folderIconCatalog.ts) - null = icona
-- predefinita (Folder). Nessun vincolo/trigger: e' un attributo puramente
-- di visualizzazione, non tocca gerarchia/tipo/RLS gia' coperti da
-- supabase-add-folders.sql e supabase-add-nested-folders.sql.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), dopo
-- supabase-add-folders.sql (richiede che la tabella folders esista gia').

alter table folders add column if not exists icon text;
