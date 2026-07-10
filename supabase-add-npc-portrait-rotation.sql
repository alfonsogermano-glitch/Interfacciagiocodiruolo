-- Tab "Immagine" condiviso (PG/PNG/Mostri): i PNG adottano lo stesso
-- modello di crop live {x,y,scale} gia' usato dai Mostri, incluso il
-- controllo di rotazione immagine. portrait_crop esiste gia' come colonna
-- jsonb su npcs (cambia solo la forma del JSON contenuto, {centerX,
-- centerY,zoom} -> {x,y,scale}, nessuna migrazione necessaria per quella).
-- portrait_rotation_degrees invece e' un campo nuovo: npcs.ts (via
-- entitiesService.ts) fa un upsert riflesso 1:1 sui nomi di colonna
-- (toSnakeCase), senza un bucket jsonb di fallback per campi sconosciuti
-- come sheet_data su characters - serve quindi la colonna reale.
--
-- Da eseguire manualmente nell'SQL editor di Supabase (stessa convenzione
-- dei file supabase-add-*.sql esistenti in questo repo). Non ancora
-- eseguita: il tab "Immagine" per i PNG non salva la rotazione finche'
-- questa colonna non esiste (l'upsert di saveNPC fallirebbe).

alter table npcs add column if not exists portrait_rotation_degrees numeric default 0;
