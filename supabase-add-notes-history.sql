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
-- RLS abilitata, ZERO policy - stessa postura di entity_notes stessa
-- (corretto 2026-07-30: verificato DAL VIVO durante l'esecuzione di questa
-- migration che entity_notes ha gia' RLS abilitata senza alcuna policy,
-- non "nessuna RLS" come dichiarato erroneamente in un giro precedente -
-- un grep sulle sole CREATE POLICY nelle migration non intercetta un
-- ENABLE ROW LEVEL SECURITY senza policy associate). Con RLS abilitata e
-- zero policy, Postgres nega implicitamente OGNI riga a client
-- anon/authenticated (query dirette dal browser tornano sempre vuote);
-- solo l'edge function, che usa la service role key (bypassa RLS per
-- definizione), puo' leggere/scrivere - ed e' l'unico punto che gia'
-- incapsula tutti i controlli di permesso (canAccessEntityNotes).
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

-- Vedi commento sopra: nessuna policy aggiunta di proposito (zero accesso
-- diretto da client anon/authenticated, solo edge function via service
-- role) - idempotente, sicuro da rieseguire.
alter table entity_notes_history enable row level security;
