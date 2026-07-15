-- Rimuove "Cerchio portrait" (portrait_border_color/visible/label): dead
-- feature confermata in sessione dedicata (2026-07-15) - zero consumer reali
-- fuori dalla propria anteprima di editing in MonsterImageExtras, gia'
-- rimossa a livello applicativo (tipo Monster, UI del tab "Immagine",
-- PortraitCropFrame). Il Token Studio (token_color/token_border_style/ecc.,
-- vedi supabase-add-token-studio.sql) serve lo stesso bisogno concettuale.
--
-- Include anche la pulizia delle stesse colonne su npcs: aggiunte in
-- supabase-add-token-studio.sql come "allineamento a monsters" in vista di
-- un editor NPC mai costruito - l'interfaccia NPC lato applicazione non le
-- ha mai dichiarate ne' lette/scritte, quindi sono orfane fin dalla loro
-- creazione, non solo da questa rimozione.
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor), in ordine:
-- e' idempotente, puo' essere rieseguito senza effetti collaterali.

alter table monsters drop column if exists portrait_border_color;
alter table monsters drop column if exists portrait_border_visible;
alter table monsters drop column if exists portrait_border_label;

alter table npcs drop column if exists portrait_border_color;
alter table npcs drop column if exists portrait_border_visible;
alter table npcs drop column if exists portrait_border_label;
