-- Cronologia versioni per il contenuto delle note (entity_notes.content/
-- content_rich) - sopravvive a chiusura/riapertura, a differenza
-- dell'undo in-sessione di TipTap History. Tabella dedicata (non una
-- colonna come il Cestino, vedi supabase-add-notes-trash.sql): qui
-- servono piu' righe storiche per la stessa nota, non uno stato singolo.
--
-- Una riga per salvataggio SIGNIFICATIVO, non per ogni PUT: la logica che
-- decide quando inserire (soglia di 15 minuti dall'ultimo snapshot della
-- stessa nota, e solo se la richiesta modifica davvero il contenuto) vive
-- lato server in supabase/functions/server/index.tsx (snapshotNoteHistory),
-- non qui - questa migration crea solo lo schema.
--
-- Nessuna RLS/policy: stessa postura di entity_notes stessa (verificato,
-- nessuna migration la abilita) - la tabella non e' mai raggiunta da query
-- dirette del client Supabase, solo dall'edge function con service role,
-- che gia' incapsula tutti i controlli di permesso (canAccessEntityNotes).
--
-- on delete cascade: se una nota viene eliminata definitivamente (purge
-- dal Cestino), la sua cronologia sparisce con lei - stessa semantica del
-- Cestino, nessuna riga orfana da gestire a parte.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

create table if not exists entity_notes_history (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references entity_notes(id) on delete cascade,
  campaign_id uuid,
  content text,
  content_rich jsonb,
  saved_by_profile_id text,
  created_at timestamptz not null default now()
);

-- Le uniche due query previste: "ultimo snapshot di questa nota" (per il
-- throttle) e "elenco cronologia di questa nota, piu' recenti prima" (per
-- la UI) - entrambe filtrano per note_id e ordinano per created_at desc,
-- coperte dallo stesso indice.
create index if not exists idx_entity_notes_history_note_created
  on entity_notes_history(note_id, created_at desc);
