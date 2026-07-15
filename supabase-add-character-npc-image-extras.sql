-- Estende a characters/npcs le colonne cornice+cover gia' presenti su
-- monsters (portrait_frame_*, cover_*, frame_rotation*, cover_frame_*) -
-- stessa struttura, per riusare EntityImageExtras (generalizzazione di
-- MonsterImageExtras) su tutte e tre le entita'. Vedi sessione dedicata
-- (2026-07-15) per il piano completo.
--
-- NON include il rename dei tipi visual_assets (monster-frame/
-- monster-portrait-frame -> frame/portrait-frame): quello e' in
-- supabase-rename-visual-asset-frame-types.sql, da eseguire SOLO dopo che
-- il nuovo codice frontend e' gia' in produzione (altrimenti le cornici
-- gia' caricate per i Mostri spariscono dalla UI nella finestra tra rename
-- e deploy - non e' un caso coperto dal fallback PGRST204, che gestisce
-- solo colonne mancanti, non valori stringa che non matchano piu').
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), in ordine:
-- e' idempotente, puo' essere rieseguito senza effetti collaterali.
-- Sicuro da eseguire in qualunque momento rispetto al deploy del codice
-- (stesso pattern di degradazione PGRST204 gia' in uso per le colonne
-- nuove di monsters/npcs/characters).

-- =====================================================
-- 1) characters: portrait frame + cover + cover frame
-- =====================================================
alter table characters add column if not exists portrait_frame_asset_id text;
alter table characters add column if not exists portrait_frame_rotation_degrees integer default 0;
alter table characters add column if not exists portrait_frame_offset_x integer default 0;
alter table characters add column if not exists portrait_frame_offset_y integer default 0;
alter table characters add column if not exists portrait_frame_scale_x numeric default 1;
alter table characters add column if not exists portrait_frame_scale_y numeric default 1;
alter table characters add column if not exists cover_image_url text;
alter table characters add column if not exists cover_image_scale numeric default 1;
alter table characters add column if not exists cover_crop jsonb;
alter table characters add column if not exists cover_rotation_degrees integer default 0;
alter table characters add column if not exists frame_rotation integer default 0 check (frame_rotation in (0, 90));
alter table characters add column if not exists frame_rotation_degrees integer default 0;
alter table characters add column if not exists cover_frame_offset_x integer default 0;
alter table characters add column if not exists cover_frame_offset_y integer default 0;
alter table characters add column if not exists cover_frame_scale_x numeric default 1;
alter table characters add column if not exists cover_frame_scale_y numeric default 1;
alter table characters add column if not exists cover_frame_asset_id text;

-- =====================================================
-- 2) npcs: stesso set - npc parte da zero, nessun campo preesistente da
--    conciliare (a differenza di characters, vedi sezione 3 sotto)
-- =====================================================
alter table npcs add column if not exists portrait_frame_asset_id text;
alter table npcs add column if not exists portrait_frame_rotation_degrees integer default 0;
alter table npcs add column if not exists portrait_frame_offset_x integer default 0;
alter table npcs add column if not exists portrait_frame_offset_y integer default 0;
alter table npcs add column if not exists portrait_frame_scale_x numeric default 1;
alter table npcs add column if not exists portrait_frame_scale_y numeric default 1;
alter table npcs add column if not exists cover_image_url text;
alter table npcs add column if not exists cover_image_scale numeric default 1;
alter table npcs add column if not exists cover_crop jsonb;
alter table npcs add column if not exists cover_rotation_degrees integer default 0;
alter table npcs add column if not exists frame_rotation integer default 0 check (frame_rotation in (0, 90));
alter table npcs add column if not exists frame_rotation_degrees integer default 0;
alter table npcs add column if not exists cover_frame_offset_x integer default 0;
alter table npcs add column if not exists cover_frame_offset_y integer default 0;
alter table npcs add column if not exists cover_frame_scale_x numeric default 1;
alter table npcs add column if not exists cover_frame_scale_y numeric default 1;
alter table npcs add column if not exists cover_frame_asset_id text;

-- =====================================================
-- 3) Backfill: promuove cover_image_url dei PG dal vecchio formato
--    (sheet_data, fonte oggi effettivamente letta da mapRowToCharacter -
--    la colonna gia' esistente "background_url" viene ignorata come
--    fonte: e' gia' orfana/write-only, mai stata letta da nessun mapper)
-- =====================================================
update characters
set cover_image_url = sheet_data->>'coverImageUrl'
where sheet_data->>'coverImageUrl' is not null
  and cover_image_url is null;

-- coverPositionX/Y/coverScale non hanno mai avuto effetto visivo (nessuna
-- UI li applicava come transform - confermato: la preview cover nel
-- wizard e' un semplice <img object-cover> senza alcun style transform,
-- e CharacterCreationWizard.tsx li resetta sempre a (0,0,1) ad ogni
-- upload). Portati comunque nella nuova forma cover_crop {x,y,scale} per
-- continuita' del dato - zero rischio di regressione percepibile, dato
-- che EntityImageExtras sara' il primo vero consumer visivo di questi
-- valori.
update characters
set cover_crop = jsonb_build_object(
  'x', coalesce((sheet_data->>'coverPositionX')::numeric, 0),
  'y', coalesce((sheet_data->>'coverPositionY')::numeric, 0),
  'scale', coalesce((sheet_data->>'coverScale')::numeric, 1)
)
where cover_crop is null
  and sheet_data ? 'coverImageUrl';
