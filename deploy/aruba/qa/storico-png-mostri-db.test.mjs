// In-memory PostgreSQL, real SQL 040. npcs/monsters are stubs here (production:
// create-schema.sql); the storico contract is read-only and never writes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createStoricoPngMostriService} from '../../../apps/aruba-api/src/storico-png-mostri-service.mjs';

const owner='71000000-0000-4000-8000-000000000021';
const campaign='71000000-0000-4000-8000-000000000023';
const npc='71000000-0000-4000-8000-000000000024';
const monster='71000000-0000-4000-8000-000000000025';
const legacy='71000000-0000-4000-8000-000000000026';
const other='71000000-0000-4000-8000-000000000027';
const stub=table=>`CREATE TABLE IF NOT EXISTS hollowgate_vtt.${table}(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid REFERENCES hollowgate_vtt.campaigns(id),
 owner_profile_id text, name text, description text, notes text,
 environment_id uuid, chapter_id uuid, map_location_id uuid,
 image_url text, cover_image_url text, ruleset text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());`;
async function fixture(){
 const db=new PGlite();
 const directory=new URL('../sql/',import.meta.url);
 const names=readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=39&&![35,36,37].includes(Number(name.slice(0,3)))).sort();
 for(const name of names)await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.exec(stub('npcs'));
 await db.exec(stub('monsters'));
 await db.exec(readFileSync(new URL('../sql/040_vtt_storico_png_mostri.sql',import.meta.url),'utf8'));
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
   ($1,'storico-owner@example.invalid','Storico Owner','active',now(),'local'),
   ($2,'storico-other@example.invalid','Storico Other','active',now(),'local')`,[owner,other]);
 const campaignId=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'Storico QA','','hsc') RETURNING id`,[owner])).rows[0].id;
 await db.query(`INSERT INTO hollowgate_vtt.npcs(id,campaign_id,owner_profile_id,name,description,notes,ruleset) VALUES($1,$2,$3,'Dio dei carmini','Testo','Nota del consigliere','hsc')`,[npc,campaignId,owner]);
 await db.query(`INSERT INTO hollowgate_vtt.monsters(id,campaign_id,owner_profile_id,name,description,notes,ruleset) VALUES($1,$2,$3,'Gigante storico','Testo','Nota del GM','hsc')`,[monster,campaignId,owner]);
  await db.query(`INSERT INTO hollowgate_vtt.npcs(id,campaign_id,owner_profile_id,name) VALUES($1,$2,NULL,'Senza propietario storico')`,[legacy,campaignId]);
  await db.exec('SET ROLE hollowgate_api_runtime;');
 return {db,pool:{query:(text,args)=>db.query(text,args)},campaign:campaignId};
}
async function docsFor(f,actor,after){
 const {rows}=await f.pool.query('SELECT v.item FROM hollowgate_vtt.list_storico_png_mostri($1,$2) AS v',[actor,after]);
 return rows.map(row=>row.item);
}
async function readDoc(f,actor,id){
 const {rows}=await f.pool.query('SELECT hollowgate_vtt.read_storico_png_mostri($1,$2) AS item',[actor,id]);
 return rows[0]?.item;
}
test('storico PNG/Mostri: owner and campaign-owner reads, denial, native untouched',async()=>{
 const f=await fixture();
 try{
  const docs=await docsFor(f,owner,null);
  assert.equal(docs.length,3);
  const npcDoc=docs.find(doc=>doc.id===npc);
  assert.equal(npcDoc.kind,'npcs');
  assert.equal(npcDoc.name,'Dio dei carmini');
  assert.equal(npcDoc.ruleset,'hsc');
  assert.equal(npcDoc.ownerProfileId,owner);
  assert.equal(npcDoc.campaignId,f.campaign);
  assert.equal(npcDoc.storicoType,'npcs');
  assert.ok(npcDoc.createdAt);
  assert.deepEqual(Object.keys(npcDoc).sort(),
   ['campaignId','chapterId','coverImageUrl','createdAt','description','environmentId','id',
    'imageUrl','kind','mapLocationId','name','notes','ownerProfileId','ruleset','source',
    'storicoType','updatedAt']);
  const monsterDoc=docs.find(doc=>doc.id===monster);
  assert.equal(monsterDoc.kind,'monsters');
  assert.equal(monsterDoc.ownerProfileId,owner);
  const legacyDoc=docs.find(doc=>doc.id===legacy);
  assert.equal(legacyDoc.ownerProfileId,null);
  const page=await docsFor(f,owner,npc);
  assert.equal(page.length,2);
  assert.ok(page.every(doc=>doc.id>npc));
  // Another user sees nothing, even though the campaign owner is the owner.
  assert.deepEqual(await docsFor(f,other,null),[]);
  assert.equal(await readDoc(f,other,npc),null);
  assert.equal(await readDoc(f,owner,'71000000-0000-4000-8000-0000000000ff'),null);
  // Campaign-owner read of the legacy row without a legacy owner.
  const legacyRead=await readDoc(f,owner,legacy);
  assert.ok(legacyRead);
  assert.equal(legacyRead.ownerProfileId,null);
  // Historical rows stay untouched by the read path.
  await f.db.exec('RESET ROLE');
  assert.equal((await f.pool.query('SELECT count(*) AS c FROM hollowgate_vtt.npcs')).rows[0].c,2);
  assert.equal((await f.pool.query('SELECT count(*) AS c FROM hollowgate_vtt.monsters')).rows[0].c,1);
 }finally{await f.db.close();}
});
test('historical service uses real SQL and denies orphan, invalid and inactive ownership',async()=>{
 const f=await fixture();
 try{
  const service=createStoricoPngMostriService({pool:f.pool});
  assert.equal((await service.list(owner)).items.length,3);
  await f.db.exec('RESET ROLE');
  const ids=[];
  for(const [campaignId,profile] of [[null,null],[f.campaign,'unknown-profile'],
   [f.campaign,'------------------------------------']]){
   ids.push((await f.db.query(`INSERT INTO hollowgate_vtt.npcs(campaign_id,owner_profile_id,name)
    VALUES($1,$2,'Non pubblicare') RETURNING id`,[campaignId,profile])).rows[0].id);
  }
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  for(const actor of [owner,other]){
   for(const id of ids)await assert.rejects(service.read(actor,id),e=>e.status===404);
  }
  assert.equal((await service.list(owner)).items.length,3);
  await assert.rejects(f.db.query('SELECT * FROM hollowgate_vtt.npcs'),e=>e.code==='42501');
  await f.db.exec('RESET ROLE');
  // A verified but disabled account must not retain historical access.
  await f.db.query("UPDATE hollowgate_auth.users SET email_verified_at=NULL WHERE id=$1",[owner]);
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  assert.deepEqual((await service.list(owner)).items,[]);
 }finally{await f.db.close();}
});
