-- Rimozione della Cronologia versioni (entity_notes_history) - la
-- funzionalita' e' stata sostituita da un semplice pulsante "Annulla" che
-- richiama l'undo nativo di TipTap History (gia' incluso in StarterKit),
-- giudicato sufficiente: la cronologia persistita a 3 fasi (schema,
-- endpoint, UI - vedi supabase-add-notes-history.sql) e' stata rimossa dal
-- codice client/server. Questo script rimuove anche lo schema DB
-- corrispondente, per completezza - non eseguito automaticamente insieme
-- alla rimozione del codice (nessuna credenziale DB disponibile qui,
-- stessa disciplina gia' seguita per la creazione della tabella).
--
-- irreversibile: droppa la tabella e ogni riga di cronologia gia' salvata
-- (le poche versioni eventualmente gia' catturate nella finestra in cui la
-- Fase 1 e' stata attiva). Se preferisci un passaggio intermedio piu'
-- prudente (tenere i dati accessibili ma fuori dalla tabella "ufficiale"
-- per un po', prima di un drop vero e proprio in un secondo momento), usa
-- l'ALTER commentato sotto AL POSTO del drop, non insieme.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

-- alter table entity_notes_history rename to entity_notes_history_archived_2026_07_30;

drop table if exists entity_notes_history;
