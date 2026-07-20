-- Cartelle annidate (max 5 livelli) - Fase 3 del piano "sistema di cartelle"
-- (Fase 0: supabase-add-folders.sql - tabella folders, entity_type, RLS).
-- Solo schema, nessuna UI/hook ancora collegati.
--
-- parent_folder_id e' opzionale (root = null). Il trigger sotto e' l'unico
-- punto che garantisce, in un solo passaggio, tre cose:
-- 1) la sotto-cartella ha lo stesso entity_type/campaign_id del genitore
--    (un mostro non puo' finire, per transitivita', dentro una cartella PNG
--    nidificata dentro una cartella di tipo diverso);
-- 2) nessun riferimento circolare (una cartella non puo' diventare, per
--    quanto indiretta, antenata di se stessa - romperebbe qualunque
--    ricostruzione dell'albero lato client e qualunque query ricorsiva);
-- 3) profondita' massima di 5 livelli (confermato in fase di piano),
--    applicata anche qui lato DB, coerente con la difesa in profondita'
--    gia' usata per gli altri vincoli critici di questa sessione (RLS,
--    vincolo di tipo tra entita' e cartella in supabase-add-folders.sql).
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), dopo
-- supabase-add-folders.sql (richiede che la tabella folders esista gia').

alter table folders add column if not exists parent_folder_id uuid references folders(id) on delete set null;

create index if not exists idx_folders_parent on folders(parent_folder_id);

create or replace function check_folder_hierarchy()
returns trigger as $$
declare
  current_id uuid;
  depth integer := 1;
  parent_entity_type text;
  parent_campaign_id uuid;
begin
  if new.parent_folder_id is null then
    return new;
  end if;

  if new.parent_folder_id = new.id then
    raise exception 'una cartella non puo essere genitore di se stessa';
  end if;

  select entity_type, campaign_id into parent_entity_type, parent_campaign_id
  from folders where id = new.parent_folder_id;

  if parent_entity_type is null then
    raise exception 'cartella genitore non trovata';
  end if;
  if parent_entity_type <> new.entity_type or parent_campaign_id <> new.campaign_id then
    raise exception 'la sotto-cartella deve avere lo stesso tipo e la stessa campagna della cartella genitore';
  end if;

  -- Risale la catena di antenati partendo dal genitore proposto: rileva un
  -- eventuale ciclo (se si ritrova new.id lungo la risalita) e applica il
  -- limite di profondita' nello stesso ciclo, senza una query ricorsiva
  -- separata. depth parte da 1 (la riga stessa) e viene incrementata a ogni
  -- passo verso la radice.
  current_id := new.parent_folder_id;
  while current_id is not null loop
    depth := depth + 1;
    if current_id = new.id then
      raise exception 'riferimento circolare tra cartelle';
    end if;
    if depth > 5 then
      raise exception 'profondita massima di annidamento (5 livelli) superata';
    end if;
    select parent_folder_id into current_id from folders where id = current_id;
  end loop;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_folder_hierarchy on folders;
create trigger trg_check_folder_hierarchy
  before insert or update of parent_folder_id, entity_type, campaign_id on folders
  for each row execute function check_folder_hierarchy();
