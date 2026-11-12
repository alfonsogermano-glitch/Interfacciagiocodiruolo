BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 campaign uuid;other_campaign uuid;character uuid;parent uuid;child_a uuid;child_b uuid;
 outsider uuid;result uuid;count_n integer;order_json jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'subtabs-owner@example.org','Owner','active',now(),'local'),
 (owner_b,'subtabs-guest@example.org','Guest','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'Subtabs test','', 'hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(owner_b,'Other','', 'hsc') INTO other_campaign;
 SELECT hollowgate_vtt.create_character_draft(owner_a,campaign,'Investigatore') INTO character;
 SELECT hollowgate_vtt.save_owned_character_sheet(owner_a,campaign,character,'Investigatore',
 '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO result;
 IF result IS DISTINCT FROM character THEN RAISE EXCEPTION 'Character inactive';END IF;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_a,campaign,character,'Diario',NULL) INTO parent;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_a,campaign,character,'Primo',parent) INTO child_a;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_a,campaign,character,'Secondo',parent) INTO child_b;
 IF parent IS NULL OR child_a IS NULL OR child_b IS NULL THEN RAISE EXCEPTION 'Failed to create parent/subtabs';END IF;
 SELECT count(*) INTO count_n FROM hollowgate_vtt.list_owned_character_notes_v2(owner_a,campaign,character,NULL);
 IF count_n<>1 THEN RAISE EXCEPTION 'Children leaked into top-level list';END IF;
 SELECT count(*) INTO count_n FROM hollowgate_vtt.list_owned_character_notes_v2(owner_a,campaign,character,parent);
 IF count_n<>2 THEN RAISE EXCEPTION 'Children unavailable';END IF;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_a,campaign,character,'Third level',child_a) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Allowed depth 3';END IF;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_b,campaign,character,'Forged',parent) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Guest created child';END IF;
 SELECT hollowgate_vtt.create_owned_character_note_v2(owner_a,other_campaign,character,'Forged',parent) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Cross campaign child';END IF;
 SELECT count(*) INTO count_n FROM hollowgate_vtt.list_owned_character_notes_v2(owner_b,campaign,character,parent);
 IF count_n<>0 THEN RAISE EXCEPTION 'Guest read children';END IF;
 SELECT count(*) INTO count_n FROM hollowgate_vtt.list_owned_character_notes_v2(owner_a,campaign,character,child_a);
 IF count_n<>0 THEN RAISE EXCEPTION 'Allowed third-level list';END IF;
 order_json=jsonb_build_array(child_b::text,child_a::text);
 SELECT hollowgate_vtt.set_owned_note_subtab_order(owner_a,campaign,character,parent,order_json) INTO result;
 IF result IS DISTINCT FROM parent THEN RAISE EXCEPTION 'Order write refused';END IF;
 SELECT tab_order INTO order_json FROM hollowgate_vtt.list_owned_character_notes_v2(owner_a,campaign,character,NULL) WHERE id=parent;
 IF order_json IS DISTINCT FROM jsonb_build_array(child_b::text,child_a::text) THEN RAISE EXCEPTION 'Order not saved';END IF;
 SELECT hollowgate_vtt.set_owned_note_subtab_order(owner_b,campaign,character,parent,jsonb_build_array(child_b::text,child_a::text)) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Guest wrote order';END IF;
 SELECT hollowgate_vtt.set_owned_note_subtab_order(owner_a,campaign,character,parent,jsonb_build_array(child_b::text,child_b::text)) INTO result;
 RAISE EXCEPTION 'Duplicate order unexpectedly allowed';
EXCEPTION WHEN SQLSTATE '22023' THEN
 IF SQLERRM NOT LIKE '%subtab identifiers%' THEN RAISE;END IF;
END $$;
ROLLBACK;
