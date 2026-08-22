-- P0.2: rimuove le vecchie policy di scrittura permissive.
-- Nessun oggetto Storage viene modificato; le policy di lettura pubblica
-- e le policy di scrittura limitate alla cartella auth.uid() restano attive.

drop policy if exists "character_portraits_owner_upload" on storage.objects;
drop policy if exists "character_portraits_owner_update" on storage.objects;

drop policy if exists "npc_images_owner_upload" on storage.objects;
drop policy if exists "npc_images_owner_update" on storage.objects;
drop policy if exists "npc_images_owner_delete" on storage.objects;
