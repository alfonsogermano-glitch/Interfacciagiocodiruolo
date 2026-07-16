-- Note di campagna: allarga il CHECK esistente su entity_notes.entity_type
-- per ammettere anche 'campaign' (finora solo 'character'|'npc'|'monster'),
-- cosi' si possono creare tab libere con entityType='campaign' ed
-- entityId=<campaignId>, riusando la tabella entity_notes esistente senza
-- crearne una nuova. Verificato in produzione col nome del vincolo attuale:
-- entity_notes_entity_type_check.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

alter table entity_notes
  drop constraint entity_notes_entity_type_check;

alter table entity_notes
  add constraint entity_notes_entity_type_check
  check (entity_type = any (array['character'::text, 'npc'::text, 'monster'::text, 'campaign'::text]));
