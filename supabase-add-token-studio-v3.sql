-- Token Studio v3: consolida starburst-thin/starburst-thick in un'unica
-- forma 'starburst' (sole/ingranaggio a denti fitti), stesso trattamento
-- gia' applicato a circle-thin/thick e square-thick/frame in v2 - lo
-- spessore e' ora il controllo ortogonale token_border_thickness, non
-- serve piu' una seconda variante di forma solo per quello.
--
-- Nessuna modifica di schema: token_border_style resta la stessa colonna
-- TEXT libera. Solo una migrazione dati, idempotente (safe da rieseguire).
--
-- Gia' eseguita manualmente durante l'implementazione (trovata 1 riga reale
-- - characters.name = 'Dennis' - con token_border_style = 'starburst-thin'
-- e token_border_thickness gia' impostato indipendentemente a 'thick':
-- la migrazione rinomina solo lo stile, non tocca lo spessore gia' scelto
-- dall'utente).

update characters set token_border_style = 'starburst' where token_border_style in ('starburst-thin', 'starburst-thick');
update npcs set token_border_style = 'starburst' where token_border_style in ('starburst-thin', 'starburst-thick');
update monsters set token_border_style = 'starburst' where token_border_style in ('starburst-thin', 'starburst-thick');
