-- =====================================================
-- RESET DATI CAMPAGNA
-- Cancella TUTTI i dati della campagna di default
-- ATTENZIONE: Usa questo script SOLO se vuoi ricominciare da zero!
-- =====================================================

-- Cancella tutti i dati delle entità (in ordine per rispettare le foreign key)
DELETE FROM monsters WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM npcs WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM clues WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM situations WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM environments WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM adventures WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM character_equipment WHERE character_id IN (
  SELECT id FROM characters WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
);
DELETE FROM characters WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM equipment_catalog WHERE campaign_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM visual_assets WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Verifica che tutto sia stato cancellato
SELECT
  'characters' as table_name,
  COUNT(*) as remaining_rows
FROM characters
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'environments', COUNT(*)
FROM environments
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'monsters', COUNT(*)
FROM monsters
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'npcs', COUNT(*)
FROM npcs
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'clues', COUNT(*)
FROM clues
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'situations', COUNT(*)
FROM situations
WHERE campaign_id = '10000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'adventures', COUNT(*)
FROM adventures
WHERE campaign_id = '10000000-0000-0000-0000-000000000001';

-- Risultato atteso: tutte le righe dovrebbero essere 0
