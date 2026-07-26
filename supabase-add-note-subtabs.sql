-- Sotto-tab dentro le note: ogni nota (entity_notes) diventa essa stessa un
-- contenitore con proprie sotto-tab, riusando 1:1 la stessa tabella invece
-- di crearne una nuova - stesso pattern gia' usato per entity_type='campaign'
-- (supabase-widen-entity-notes-campaign-type.sql): le sotto-tab sono righe
-- entity_notes con entity_type='note' ed entity_id=<id della nota padre>.
--
-- Profondita' fissa a 2 livelli (nota -> sotto-tab, mai oltre): una sotto-tab
-- e' sempre una foglia, mai un altro contenitore - imposto lato applicazione
-- (la UI non offre mai "aggiungi sotto-tab" dentro una sotto-tab), non serve
-- un vincolo DB dedicato per questo.
--
-- Nessuna cartella dentro le note: check_entity_notes_folder_type (vedi
-- supabase-add-notes-folders.sql) gia' rifiuta folder_id per entity_type
-- diverso da 'campaign', quindi le righe entity_type='note' non potranno mai
-- avere folder_id - comportamento corretto "gratis", nessuna modifica al
-- trigger necessaria.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), dopo
-- supabase-add-notes-folders.sql.

alter table entity_notes
  drop constraint entity_notes_entity_type_check;

alter table entity_notes
  add constraint entity_notes_entity_type_check
  check (entity_type = any (array['character'::text, 'npc'::text, 'monster'::text, 'campaign'::text, 'note'::text]));

-- Ordine delle sotto-tab, persistito sulla riga della nota padre (stesso
-- principio di Campaign.tabOrderCampaignNotes/tabOrderGmNotes per le note di
-- primo livello, ma qui non esiste una riga "campagna" esterna a cui
-- appoggiarsi: la nota stessa e' il proprietario naturale del proprio
-- ordine di sotto-tab). Nullable: assente = ordine di default (baseTabs poi
-- sotto-tab nell'ordine di creazione), stesso fallback gia' usato da
-- useEntityTabs.ts per savedTabOrder assente/vuoto.
alter table entity_notes add column if not exists tab_order text[];
