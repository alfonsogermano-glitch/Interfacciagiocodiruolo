BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 campaign uuid;character uuid; note uuid; result_id uuid;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'notes-owner@example.org','Note Owner','active',now(),'local'),
       (owner_b,'notes-outsider@example.org','Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'Note trial','', 'hsc') INTO campaign;
 SELECT hollowgate_vtt.create_character_draft(owner_a,campaign,'Investigatore') INTO character;
 SELECT hollowgate_vtt.save_owned_character_sheet(owner_a,campaign,character,'Investigatore',
  '{"style":"Jock","viaggio":"Campione","ambiti":{},"abilita":{},"tratti":[],"equipment":[]}'::jsonb) INTO result_id;
 IF result_id IS DISTINCT FROM character THEN RAISE EXCEPTION 'Character missing';END IF;
 SELECT hollowgate_vtt.create_owned_character_note(owner_b,campaign,character,'Falsa') INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner created note';END IF;
 SELECT hollowgate_vtt.create_owned_character_note(owner_a,campaign,character,' Diario ') INTO note;
 IF note IS NULL THEN RAISE EXCEPTION 'Owner cannot create note';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_notes(owner_a,campaign,character)
 WHERE id=note AND tab_name='Diario' AND content_rich IS NULL;
 IF n<>1 THEN RAISE EXCEPTION 'Note not listed';END IF;
 SELECT hollowgate_vtt.save_owned_character_note(owner_b,campaign,character,note,'Rubata','',
  '{"type":"doc"}'::jsonb,0,false,'all') INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner modified note';END IF;
 SELECT hollowgate_vtt.save_owned_character_note(owner_a,campaign,character,note,'Diario','Contenuto',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Test"}]}]}'::jsonb,
  5,true,'private') INTO result_id;
 IF result_id IS DISTINCT FROM note THEN RAISE EXCEPTION 'Owner cannot modify note';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_notes(owner_a,campaign,character)
 WHERE id=note AND tab_position=5 AND hidden AND visibility='private'
 AND content_rich->>'type'='doc' AND content='Contenuto';
 IF n<>1 THEN RAISE EXCEPTION 'Rich text was not saved';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_notes(owner_b,campaign,character);
 IF n<>0 THEN RAISE EXCEPTION 'Notes leaked to foreign owner';END IF;
 SELECT hollowgate_vtt.archive_owned_character_note(owner_b,campaign,character,note) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner archived note';END IF;
 SELECT hollowgate_vtt.archive_owned_character_note(owner_a,campaign,character,note) INTO result_id;
 IF result_id IS DISTINCT FROM note THEN RAISE EXCEPTION 'Owner cannot archive note';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_character_notes(owner_a,campaign,character);
 IF n<>0 THEN RAISE EXCEPTION 'Archived note visible';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.entity_notes
 WHERE id=note AND status='archived' AND content_rich->>'type'='doc';
 IF n<>1 THEN RAISE EXCEPTION 'Archive destroyed content';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.entity_notes','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.entity_notes','UPDATE')
 THEN RAISE EXCEPTION 'Direct note table privileges leaked';END IF;
END $$;
ROLLBACK;
