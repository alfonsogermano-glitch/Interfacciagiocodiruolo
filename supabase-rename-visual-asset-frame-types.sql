-- ATTENZIONE - NON ESEGUIRE ANCORA.
-- Da lanciare SOLO dopo che il nuovo codice frontend (che chiede i tipi
-- 'frame'/'portrait-frame'/'frame-default'/'portrait-frame-default') e'
-- gia' in produzione. Se questo script gira prima, tutte le cornici gia'
-- caricate per i Mostri (tipi monster-frame/monster-portrait-frame)
-- spariscono dalla UI ("Nessuna cornice") finche' il deploy del codice
-- non arriva - non e' un caso coperto dal fallback PGRST204 (quello
-- gestisce solo colonne mancanti, non valori stringa che non matchano
-- piu' quelli richiesti dal frontend).
--
-- Rinomina i tipi visual_assets a nomi neutri, condivisi tra
-- Mostri/PG/PNG (catalogo cornici unico, decisione di prodotto
-- confermata in sessione dedicata 2026-07-15). Include anche la
-- migrazione del tipo 'npc-frame' (mai avuto alcun consumer nel codice,
-- introdotto in previsione di un editor NPC mai completato) nel nuovo
-- tipo condiviso 'frame'.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).
-- E' idempotente (dopo la prima esecuzione, le UPDATE successive non
-- trovano piu' righe con i vecchi valori e sono no-op).

update visual_assets set type = 'portrait-frame-default' where type = 'monster-portrait-frame-default';
update visual_assets set type = 'frame-default' where type = 'monster-frame-default';
update visual_assets set type = 'portrait-frame' where type = 'monster-portrait-frame';
update visual_assets set type = 'frame' where type = 'monster-frame';
update visual_assets set type = 'frame' where type = 'npc-frame';
