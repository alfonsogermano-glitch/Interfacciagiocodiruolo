-- Token Studio: campi token dedicati per characters/npcs/monsters, colonne
-- immagine dirette per i Character (oggi solo dentro sheet_data), e
-- allineamento NPC alle colonne "Cerchio portrait" gia' presenti su monsters.
-- Stesso pattern di supabase-add-entity-ruleset.sql: TEXT/boolean liberi,
-- validati solo lato applicativo (vedi TokenBorderStyle in TS), nessun
-- enum/CHECK Postgres.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), in ordine:
-- e' idempotente, puo' essere rieseguito senza effetti collaterali.

-- =====================================================
-- 1) Campi token dedicati (colore, sfondo, forma bordo)
-- =====================================================
-- Deliberatamente separati da portrait_border_* (punto 3): il token sulla
-- mappa e il cerchio portrait nella scheda sono personalizzabili in modo
-- indipendente, non condividono piu' lo stesso colore come nel placeholder
-- attuale di MonstersManager.tsx.
alter table characters add column if not exists token_color text;
alter table characters add column if not exists token_background_color text;
alter table characters add column if not exists token_border_style text;

alter table npcs add column if not exists token_color text;
alter table npcs add column if not exists token_background_color text;
alter table npcs add column if not exists token_border_style text;

alter table monsters add column if not exists token_color text;
alter table monsters add column if not exists token_background_color text;
alter table monsters add column if not exists token_border_style text;

-- =====================================================
-- 2) Character: colonne immagine dirette (promosse da sheet_data)
-- =====================================================
alter table characters add column if not exists portrait_image_url text;
alter table characters add column if not exists portrait_cropped_image_url text;
alter table characters add column if not exists portrait_crop jsonb;

-- Verifica preliminare (facoltativa, di sola lettura): quante righe hanno
-- gia' questi valori scritti dal vecchio flusso dentro sheet_data, mai
-- promossi a colonna diretta.
--
-- select id, name,
--   sheet_data->>'portraitImageUrl' as legacy_portrait_url,
--   sheet_data->>'portraitCroppedImageUrl' as legacy_portrait_cropped_url,
--   sheet_data->'portraitCrop' as legacy_portrait_crop
-- from characters
-- where sheet_data->>'portraitImageUrl' is not null
--    or sheet_data->>'portraitCroppedImageUrl' is not null
--    or sheet_data->'portraitCrop' is not null;

-- Promuove i valori legacy alle colonne dirette, solo dove ancora NULL
-- (non sovrascrive eventuali dati gia' migrati). portrait_crop e' jsonb:
-- uso ->  (non ->>) per portare l'oggetto {centerX, centerY, zoom} cosi'
-- com'e', non la sua rappresentazione testuale.
update characters
set portrait_image_url = sheet_data->>'portraitImageUrl'
where sheet_data->>'portraitImageUrl' is not null
  and portrait_image_url is null;

update characters
set portrait_cropped_image_url = sheet_data->>'portraitCroppedImageUrl'
where sheet_data->>'portraitCroppedImageUrl' is not null
  and portrait_cropped_image_url is null;

update characters
set portrait_crop = sheet_data->'portraitCrop'
where sheet_data->'portraitCrop' is not null
  and portrait_crop is null;

-- Nota per l'integrazione UI (non riguarda questo script): la forma di
-- portrait_crop per i Character e' {centerX, centerY, zoom} (PortraitCrop in
-- types/character.ts), diversa da quella dei Mostri {x, y, scale} (ImageCrop
-- in monstersTypes.ts). Va normalizzata a livello applicativo quando si
-- riusa MonsterPortraitFrame per i Character, non a livello di dato salvato.

-- =====================================================
-- 3) NPC: allineamento alle colonne "Cerchio portrait" di monsters
-- =====================================================
-- Non servono cover_* / frame_* / rotation_*: gli NPC non hanno una seconda
-- immagine "cover" ne' (per ora) cornici immagine, solo il cerchio colorato.
alter table npcs add column if not exists portrait_border_color text;
alter table npcs add column if not exists portrait_border_visible boolean default true;
alter table npcs add column if not exists portrait_border_label text;
