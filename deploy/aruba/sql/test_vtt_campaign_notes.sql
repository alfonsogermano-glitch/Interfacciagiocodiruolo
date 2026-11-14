BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();
 campaign uuid;other_campaign uuid;root uuid;child uuid;result uuid;n integer;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'campaignnotes-owner@example.org','Notes Owner','active',now(),'local'),
 (owner_b,'campaignnotes-outsider@example.org','Notes Outsider','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'Campagna Note','','hsc') INTO campaign;
 SELECT hollowgate_vtt.create_owned_campaign(owner_b,'Campagna esterna','','hsc') INTO other_campaign;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner_b,campaign,'Invasione',NULL) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Outsider created campaign note';END IF;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner_a,campaign,'Diario',NULL) INTO root;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner_a,campaign,'Pagina',root) INTO child;
 IF root IS NULL OR child IS NULL THEN RAISE EXCEPTION 'Owner cannot create campaign notes';END IF;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner_a,campaign,'Third level',child) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Third nesting level allowed';END IF;
 SELECT hollowgate_vtt.create_owned_campaign_note(owner_a,other_campaign,'Other campaign',root) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Cross-campaign create allowed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaign_notes(owner_a,campaign,NULL);
 IF n<>1 THEN RAISE EXCEPTION 'Children included in root list';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaign_notes(owner_a,campaign,root);
 IF n<>1 THEN RAISE EXCEPTION 'Child not found';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaign_notes(owner_b,campaign,NULL);
 IF n<>0 THEN RAISE EXCEPTION 'Foreign owner can read notes';END IF;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner_b,campaign,child,'Rubata','{"type":"doc"}'::jsonb,0,'all') INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner changed note';END IF;
 SELECT hollowgate_vtt.save_owned_campaign_note(owner_a,campaign,child,'Pagina aggiornata','{"type":"doc"}'::jsonb,1,'private') INTO result;
 IF result IS DISTINCT FROM child THEN RAISE EXCEPTION 'Child TipTap write failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaign_notes(owner_a,campaign,root)
 WHERE id=child AND title='Pagina aggiornata' AND content_rich->>'type'='doc';
 IF n<>1 THEN RAISE EXCEPTION 'Child TipTap content lost';END IF;
 SELECT hollowgate_vtt.archive_owned_campaign_note(owner_b,campaign,root) INTO result;
 IF result IS NOT NULL THEN RAISE EXCEPTION 'Foreign owner archived note';END IF;
 SELECT hollowgate_vtt.archive_owned_campaign_note(owner_a,campaign,root) INTO result;
 IF result IS DISTINCT FROM root THEN RAISE EXCEPTION 'Owner archive failed';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes
 WHERE campaign_id=campaign AND status='archived' AND id IN (root,child);
 IF n<>2 THEN RAISE EXCEPTION 'Archive lost child or parent';END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.campaign_notes WHERE id=child AND content_rich->>'type'='doc';
 IF n<>1 THEN RAISE EXCEPTION 'Archive removed TipTap document';END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaign_notes','UPDATE')
 THEN RAISE EXCEPTION 'Direct campaign notes table privilege leaked';END IF;
END $$;
ROLLBACK;
