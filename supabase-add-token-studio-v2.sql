-- Token Studio v2: correzioni post-review rispetto al riferimento QuestPortal.
-- Segue supabase-add-token-studio.sql (gia' eseguito). Stesso pattern: TEXT/
-- boolean liberi, validati solo lato applicativo, nessun enum/CHECK Postgres,
-- idempotente (IF NOT EXISTS ovunque, puo' essere rieseguito senza effetti
-- collaterali).
--
-- Esegui questo script nella dashboard di Supabase (SQL Editor).

-- =====================================================
-- 1) Spessore bordo, indipendente dalla forma
-- =====================================================
-- Consolidamento: circle-thin/circle-thick e square-thick/square-frame
-- vengono rimossi come forme separate (restano solo circle-filled e square);
-- lo spessore diventa un controllo ortogonale applicabile a qualunque forma.
-- Default 'medium' per non lasciare NULL le righe gia' esistenti che oggi
-- non hanno ancora personalizzato il token.
alter table characters add column if not exists token_border_thickness text default 'medium';
alter table npcs add column if not exists token_border_thickness text default 'medium';
alter table monsters add column if not exists token_border_thickness text default 'medium';

-- Righe che oggi hanno gia' scelto una delle 4 forme rimosse: portale sulla
-- forma base corrispondente + spessore esplicito, cosi' non perdono la
-- personalizzazione fatta finora.
update characters set token_border_thickness = 'thin', token_border_style = 'circle-filled' where token_border_style = 'circle-thin';
update characters set token_border_thickness = 'thick', token_border_style = 'circle-filled' where token_border_style = 'circle-thick';
update characters set token_border_thickness = 'thick', token_border_style = 'square' where token_border_style = 'square-thick';
update characters set token_border_thickness = 'thin', token_border_style = 'square' where token_border_style = 'square-frame';

update npcs set token_border_thickness = 'thin', token_border_style = 'circle-filled' where token_border_style = 'circle-thin';
update npcs set token_border_thickness = 'thick', token_border_style = 'circle-filled' where token_border_style = 'circle-thick';
update npcs set token_border_thickness = 'thick', token_border_style = 'square' where token_border_style = 'square-thick';
update npcs set token_border_thickness = 'thin', token_border_style = 'square' where token_border_style = 'square-frame';

update monsters set token_border_thickness = 'thin', token_border_style = 'circle-filled' where token_border_style = 'circle-thin';
update monsters set token_border_thickness = 'thick', token_border_style = 'circle-filled' where token_border_style = 'circle-thick';
update monsters set token_border_thickness = 'thick', token_border_style = 'square' where token_border_style = 'square-thick';
update monsters set token_border_thickness = 'thin', token_border_style = 'square' where token_border_style = 'square-frame';

-- =====================================================
-- 2) Nota facoltativa (tooltip) sul bordo del token
-- =====================================================
-- Stesso pattern di portrait_border_label (npcs/monsters, "Cerchio
-- portrait"): testo libero, nessun default.
alter table characters add column if not exists token_border_label text;
alter table npcs add column if not exists token_border_label text;
alter table monsters add column if not exists token_border_label text;

-- =====================================================
-- 3) Toggle "Visibile" per il bordo del token
-- =====================================================
-- Stesso pattern di portrait_border_visible: default true, cosi' i token
-- gia' esistenti restano visibili com'erano finora.
alter table characters add column if not exists token_border_visible boolean default true;
alter table npcs add column if not exists token_border_visible boolean default true;
alter table monsters add column if not exists token_border_visible boolean default true;
