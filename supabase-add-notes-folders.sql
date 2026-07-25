-- Cartelle per organizzare le note di campagna (Fase 1 della feature
-- "Note del GM"/"Note della Campagna" - sostituiscono la lista per-entita'
-- di SessionNotesPanel.tsx). Riusa 1:1 l'infrastruttura di
-- supabase-add-folders.sql (tabella folders gia' esistente, generica per
-- campaign_id+entity_type) - qui solo si allarga il namespace ammesso e si
-- collega entity_notes allo stesso meccanismo di folder_id gia' usato da
-- characters/npcs/monsters.
--
-- Due namespace separati (non uno solo) perche' "Note del GM" e "Note della
-- Campagna" sono due sezioni distinte nella UI, con alberi di cartelle
-- indipendenti - stessa idea di 'character' vs 'premade' (stessa tabella
-- characters, namespace di cartelle separati).
--
-- folder_id resta null per tutte le righe esistenti (PG/PNG/Mostro incluse,
-- che non hanno mai avuto un concetto di cartella per le proprie tab e non
-- lo guadagnano qui: il trigger sotto lo vieta esplicitamente per
-- entity_type diverso da 'campaign') - nessun effetto collaterale su dati
-- gia' presenti.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), dopo
-- supabase-add-nested-folders.sql (richiede folders.parent_folder_id) e
-- supabase-widen-entity-notes-campaign-type.sql (richiede entity_notes con
-- entity_type='campaign' gia' ammesso).

alter table entity_notes add column if not exists folder_id uuid references folders(id) on delete set null;

create index if not exists idx_entity_notes_folder on entity_notes(folder_id);

-- =====================================================
-- Allarga il namespace di folders.entity_type: 'gmnotes' (Note del GM,
-- corrisponde a entity_notes con entity_type='campaign' e hidden=true) e
-- 'campaignnotes' (Note della Campagna, hidden=false). Nome del vincolo
-- verificato con lo stesso pattern gia' usato in
-- supabase-widen-entity-notes-campaign-type.sql (folders_entity_type_check,
-- creato implicitamente dal `check` inline in supabase-add-folders.sql).
-- =====================================================

alter table folders drop constraint if exists folders_entity_type_check;

alter table folders add constraint folders_entity_type_check
  check (entity_type = any (array['character'::text, 'premade'::text, 'npc'::text, 'monster'::text, 'gmnotes'::text, 'campaignnotes'::text]));

-- =====================================================
-- Vincolo cross-tabella (nessun CHECK cross-tabella possibile in Postgres,
-- serve un trigger - stessa idea di check_npc_folder_type in
-- supabase-add-folders.sql, con due differenze: 1) folder_id qui e' ammesso
-- SOLO per note di campagna (entity_type='campaign'), mai per tab di
-- PG/PNG/Mostro; 2) il namespace corretto della cartella dipende anche da
-- `hidden`, non solo da entity_type, perche' "GM" e "Campagna" sono la
-- stessa entity_type='campaign' distinta solo dal flag hidden.
-- =====================================================

create or replace function check_entity_notes_folder_type()
returns trigger as $$
declare
  expected_entity_type text;
begin
  if new.folder_id is null then
    return new;
  end if;

  if new.entity_type <> 'campaign' then
    raise exception 'folder_id ammesso solo per note di campagna (Note del GM/Note della Campagna)';
  end if;

  expected_entity_type := case when new.hidden then 'gmnotes' else 'campaignnotes' end;

  if not exists (
    select 1 from folders
    where id = new.folder_id
      and campaign_id = new.campaign_id
      and entity_type = expected_entity_type
  ) then
    raise exception 'folder_id non valido per questa nota (sezione o campagna non corrispondenti)';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_entity_notes_folder_type on entity_notes;
create trigger trg_check_entity_notes_folder_type
  before insert or update of folder_id, entity_type, campaign_id, hidden on entity_notes
  for each row execute function check_entity_notes_folder_type();

-- Nessuna modifica a RLS/broadcast: folders ha gia' RLS generica (non
-- per-entity_type, vedi supabase-add-folders.sql) e gia' un trigger di
-- broadcast (supabase-add-folders-broadcast-trigger.sql) - i due nuovi
-- namespace li ereditano senza altro intervento. entity_notes non ha RLS
-- propria (accesso solo via server con canAccessEntityNotes) e ha gia' il
-- proprio trigger di broadcast esistente (entity_notes_broadcast_trigger).
