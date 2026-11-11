-- Isolated disposable PostgreSQL test DB; assumes migrations 001-008.
BEGIN;
DO $$
DECLARE owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
        cid uuid; result_id uuid; n bigint;
BEGIN
 INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
 VALUES(owner_a,'campaign-a@example.org','A','active',now(),'local'),
       (owner_b,'campaign-b@example.org','B','active',now(),'local');
 SELECT hollowgate_vtt.create_owned_campaign(owner_a,'  Prima storia  ','Prova','hsc') INTO cid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Campaign not created'; END IF;
 SELECT hollowgate_vtt.update_owned_campaign(owner_b,cid,'Hacked','wrong') INTO result_id;
 IF result_id IS NOT NULL THEN RAISE EXCEPTION 'Non-owner edit accepted'; END IF;
 SELECT hollowgate_vtt.update_owned_campaign(owner_a,cid,'  Rinominata  ','nuova descrizione') INTO result_id;
 IF result_id IS DISTINCT FROM cid THEN RAISE EXCEPTION 'Owner cannot edit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM hollowgate_vtt.campaigns WHERE id=cid AND name='Rinominata' AND description='nuova descrizione' AND ruleset='hsc')
 THEN RAISE EXCEPTION 'Campaign metadata changed incorrectly'; END IF;
 IF has_function_privilege('public','hollowgate_vtt.update_owned_campaign(uuid,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'PUBLIC can update campaigns'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaigns(owner_a) WHERE id=cid AND name='Rinominata';
 IF n<>1 THEN RAISE EXCEPTION 'Owner cannot see campaign'; END IF;
 SELECT count(*) INTO n FROM hollowgate_vtt.list_owned_campaigns(owner_b) WHERE id=cid;
 IF n<>0 THEN RAISE EXCEPTION 'Campaign leaked between owners'; END IF;
 IF has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaigns','INSERT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaigns','SELECT')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaigns','UPDATE')
 OR has_table_privilege('hollowgate_api_runtime','hollowgate_vtt.campaigns','DELETE')
 THEN RAISE EXCEPTION 'Direct table privilege leaked'; END IF;
 IF EXISTS (
 SELECT 1 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 CROSS JOIN LATERAL aclexplode(p.proacl) a
 WHERE n.nspname='hollowgate_vtt' AND p.proname='create_owned_campaign'
   AND a.grantee=0 AND a.privilege_type='EXECUTE'
) THEN RAISE EXCEPTION 'Public can create campaigns'; END IF;
END $$;
ROLLBACK;
