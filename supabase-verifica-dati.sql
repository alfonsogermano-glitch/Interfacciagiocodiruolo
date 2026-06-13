-- =====================================================
-- QUERY DI VERIFICA DATI E STRUTTURA DATABASE
-- Esegui queste query una per volta per diagnosticare il problema
-- =====================================================

-- 1. VERIFICA CHE LE COLONNE SIANO STATE CREATE
-- =====================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'environments'
  AND column_name IN (
    'parent_location_id',
    'adventure_id',
    'map_location_id',
    'location_type',
    'icon_id',
    'exit_points',
    'hidden_details',
    'npcs_present',
    'sort_order'
  )
ORDER BY column_name;

-- 2. VERIFICA DATI ENVIRONMENTS ESISTENTI
-- =====================================================
SELECT
  id,
  name,
  parent_location_id,
  location_type,
  adventure_id,
  environment_id
FROM environments
ORDER BY name;

-- 3. VERIFICA COLONNE MONSTERS
-- =====================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'monsters'
  AND column_name IN (
    'environment_id',
    'adventure_id',
    'base_monster_id',
    'freschezza',
    'max_freschezza',
    'attacco',
    'difesa',
    'custom_traits',
    'custom_special_actions'
  )
ORDER BY column_name;

-- 4. VERIFICA DATI MONSTERS ESISTENTI
-- =====================================================
SELECT
  id,
  name,
  environment_id,
  freschezza,
  max_freschezza,
  attacco,
  difesa,
  custom_traits,
  custom_special_actions
FROM monsters;

-- 5. VERIFICA COLONNE NPCS
-- =====================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'npcs'
  AND column_name IN (
    'environment_id',
    'adventure_id',
    'personality',
    'freschezza',
    'max_freschezza',
    'attacco',
    'difesa'
  )
ORDER BY column_name;

-- 6. CONTA RIGHE PER TABELLA
-- =====================================================
SELECT
  'environments' as table_name,
  COUNT(*) as row_count
FROM environments
UNION ALL
SELECT
  'monsters',
  COUNT(*)
FROM monsters
UNION ALL
SELECT
  'npcs',
  COUNT(*)
FROM npcs
UNION ALL
SELECT
  'clues',
  COUNT(*)
FROM clues
UNION ALL
SELECT
  'situations',
  COUNT(*)
FROM situations;
