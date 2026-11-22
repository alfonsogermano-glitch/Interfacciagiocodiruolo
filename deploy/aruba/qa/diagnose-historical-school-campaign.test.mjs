import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('historical diagnosis runs read-only with absent and present optional ledger',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE SCHEMA hollowgate_auth; CREATE SCHEMA hollowgate_vtt;
   CREATE TABLE hollowgate_auth.users(id uuid PRIMARY KEY,status text,email_verified_at timestamptz);
   CREATE TABLE hollowgate_vtt.campaigns(id uuid PRIMARY KEY,owner_id uuid,name text);
   CREATE TABLE hollowgate_vtt.character_drafts(id uuid,campaign_id uuid);
   CREATE FUNCTION hollowgate_vtt.list_owned_campaigns(uuid) RETURNS TABLE(id uuid)
   LANGUAGE sql AS 'SELECT id FROM hollowgate_vtt.campaigns WHERE owner_id=$1';
   INSERT INTO hollowgate_auth.users VALUES('11111111-1111-4111-8111-111111111111','active',now());
   INSERT INTO hollowgate_vtt.campaigns VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','La scuola degli orrori');`);
  const sql=readFileSync(new URL('./diagnose-historical-school-campaign.sql',import.meta.url),'utf8').replace(/^\\set.*$/m,'');
  const first=await db.exec(sql);
  const row=first.flatMap(result=>result.rows).find(row=>row.name);
  assert.equal(row.name,'La scuola degli orrori');
  assert.equal(row.returned_by_owner_routine,true);
  assert.equal('email' in row,false);
  await db.exec(`CREATE TABLE hollowgate_vtt.migration_source_records(source_table text,target_id text,source_payload jsonb);
   INSERT INTO hollowgate_vtt.migration_source_records VALUES('campaigns','22222222-2222-4222-8222-222222222222','{"name":"La scuola degli orrori"}');
   CREATE TABLE hollowgate_vtt.narrative_content_documents(campaign_id uuid,kind text);
   INSERT INTO hollowgate_vtt.narrative_content_documents VALUES('22222222-2222-4222-8222-222222222222','npc');`);
  await db.exec(sql);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM hollowgate_vtt.campaigns')).rows[0].n,1);
 }finally{await db.close();}
});
