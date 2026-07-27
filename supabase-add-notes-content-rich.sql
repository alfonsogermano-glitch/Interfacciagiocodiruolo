-- Fase 0 dell'adozione di TipTap come editor rich text per le note
-- (Note del GM/Campagna, sotto-tab, tab personalizzate di PG/PNG/Mostro -
-- tutte righe entity_notes, la colonna e' generica, non specifica di un
-- entity_type). Nuova colonna separata invece di riusare/convertire
-- `content`: TipTap salva un documento JSON strutturato (editor.getJSON()),
-- non testo semplice - una colonna a parte evita qualunque tocco ai dati
-- esistenti e permette al vecchio formato di restare leggibile finche' una
-- nota non viene esplicitamente "promossa" al nuovo editor lato client.
--
-- Nullable, nessun default, nessun backfill: una riga con content_rich
-- NULL significa "non ancora passata al nuovo editor", non "documento
-- vuoto" - la UI (RichTextEditor.tsx) distingue i due casi mostrando il
-- contenuto legacy in sola lettura finche' non viene promossa.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table entity_notes add column if not exists content_rich jsonb;
