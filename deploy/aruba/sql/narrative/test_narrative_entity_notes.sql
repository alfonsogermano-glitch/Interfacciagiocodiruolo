BEGIN;
DO $$
<<narrative_notes_test>>
DECLARE
 owner_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();campaign_id uuid;
 entity_id uuid:=gen_random_uuid();root_id uuid;child_id uuid;result_id uuid;
 payload jsonb;ordered jsonb;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  (owner_id,'narrative-notes-owner-'||owner_id||'@example.org','Owner','active',now(),'local'),
  (other_id,'narrative-notes-other-'||other_id||'@example.org','Other','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_id,'Narrative notes test','','hsc') INTO campaign_id;
 payload:=jsonb_build_object('id',entity_id::text,'campaignId',campaign_id::text,'name','Custode');
 SELECT hollowgate_vtt.save_owned_narrative_content(owner_id,campaign_id,'npcs',entity_id,payload) INTO result_id;
 IF result_id IS DISTINCT FROM entity_id THEN RAISE EXCEPTION 'Narrative fixture write failed';END IF;

 SELECT hollowgate_vtt.create_owned_narrative_entity_note(other_id,campaign_id,'npcs',entity_id,'Forged',NULL) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner created narrative note';END IF;
 SELECT hollowgate_vtt.create_owned_narrative_entity_note(owner_id,campaign_id,'monsters',entity_id,'Wrong kind',NULL) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Wrong kind created narrative note';END IF;
 SELECT hollowgate_vtt.create_owned_narrative_entity_note(owner_id,campaign_id,'npcs',entity_id,'Segreti',NULL) INTO root_id;
 IF root_id IS NULL THEN RAISE EXCEPTION 'Owner root narrative note creation failed';END IF;
 SELECT hollowgate_vtt.create_owned_narrative_entity_note(owner_id,campaign_id,'npcs',entity_id,'Dettaglio',root_id) INTO child_id;
 IF child_id IS NULL THEN RAISE EXCEPTION 'Owner child narrative note creation failed';END IF;
 IF (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_entity_notes(owner_id,campaign_id,'npcs',entity_id,NULL))<>1 OR
    (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_entity_notes(owner_id,campaign_id,'npcs',entity_id,root_id))<>1 OR
    (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_entity_notes(other_id,campaign_id,'npcs',entity_id,NULL))<>0
 THEN RAISE EXCEPTION 'Narrative note scope isolation failed';END IF;

 SELECT hollowgate_vtt.save_owned_narrative_entity_note(owner_id,campaign_id,'npcs',entity_id,child_id,
  'Dettaglio','Test',jsonb_build_object('type','doc','content',jsonb_build_array()),1,true,'private') INTO result_id;
 IF result_id IS DISTINCT FROM child_id THEN RAISE EXCEPTION 'Narrative TipTap save failed';END IF;
 ordered:=jsonb_build_array(child_id::text);
 SELECT hollowgate_vtt.set_owned_narrative_note_subtab_order(owner_id,campaign_id,'npcs',entity_id,root_id,ordered) INTO result_id;
 IF result_id IS DISTINCT FROM root_id THEN RAISE EXCEPTION 'Narrative subtab order failed';END IF;
 SELECT hollowgate_vtt.archive_owned_narrative_entity_note(other_id,campaign_id,'npcs',entity_id,root_id) INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner archived narrative note';END IF;
 SELECT hollowgate_vtt.archive_owned_narrative_entity_note(owner_id,campaign_id,'npcs',entity_id,root_id) INTO result_id;
 IF result_id IS DISTINCT FROM root_id OR
    (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_entity_notes(owner_id,campaign_id,'npcs',entity_id,NULL))<>0 OR
    (SELECT count(*) FROM hollowgate_vtt.list_owned_narrative_entity_notes(owner_id,campaign_id,'npcs',entity_id,root_id))<>0
 THEN RAISE EXCEPTION 'Narrative note reversible archive failed';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.narrative_entity_notes','SELECT') OR
    has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.narrative_entity_notes','INSERT')
 THEN RAISE EXCEPTION 'Runtime has direct narrative note table privileges';END IF;
END $$;
ROLLBACK;
