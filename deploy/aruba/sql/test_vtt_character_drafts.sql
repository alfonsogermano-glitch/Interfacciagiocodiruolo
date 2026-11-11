BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 c uuid; d uuid; n integer; result_id uuid;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'draft-a@example.org','A','active',now(),'local'),
       (owner_b,'draft-b@example.org','B','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'PG','', 'hsc') INTO c;
 SELECT hollowgate_vtt.create_character_draft(owner_b,c,'intruso') INTO d;
 IF d IS NOT NULL THEN RAISE EXCEPTION 'Non-owner draft creation accepted';END IF;
 SELECT hollowgate_vtt.create_character_draft(owner_a,c,'  PG Test  ') INTO d;
 IF d IS NULL THEN RAISE EXCEPTION 'Owner draft creation rejected';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_character_drafts(owner_a,c)
 WHERE id=d AND name='PG Test' AND sheet_data='{}'::jsonb;
 IF n<>1 THEN RAISE EXCEPTION 'Draft missing or malformed';END IF;
 SELECT hollowgate_vtt.save_owned_character_sheet(owner_b,c,d,'Impersonatore',
   '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Non-owner modified character';END IF;
 SELECT hollowgate_vtt.save_owned_character_sheet(owner_a,c,d,'Ken',
   '{"style":"Jock","viaggio":"Campione","ambiti":{"Fisico":2},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO result_id;
 IF result_id IS DISTINCT FROM d THEN RAISE EXCEPTION 'Owner cannot save character';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_character_drafts(owner_a,c)
 WHERE id=d AND name='Ken' AND status='active' AND sheet_data->>'style'='Jock';
 IF n<>1 THEN RAISE EXCEPTION 'Full character sheet not stored';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_character_drafts(owner_b,c) WHERE id=d;
 IF n<>0 THEN RAISE EXCEPTION 'Cross-account draft leaked';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_drafts','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.character_drafts','INSERT')
 THEN RAISE EXCEPTION 'Direct character privilege leaked';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(p.proacl) grant_entry
 WHERE ns.nspname='hollowgate_vtt'
 AND p.proname='create_character_draft' AND grant_entry.grantee=0
 AND grant_entry.privilege_type='EXECUTE') THEN
  RAISE EXCEPTION 'Public character creation privilege leaked';END IF;
END $$;
ROLLBACK;
