// In-memory PostgreSQL: root migrations 001-039, catalog 001-006 (projection).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeCampaignCatalogService} from '../../../apps/aruba-api/src/native-campaign-catalog-service.mjs';

const owner='20000000-0000-4000-8000-000000000001';
const other='20000000-0000-4000-8000-000000000002';
async function fixture(){
 const db=new PGlite();
 const root=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(root).filter(n=>/^\d{3}_.*\.sql$/.test(n)&&Number(n.slice(0,3))<=39&&![35,36,37].includes(Number(n.slice(0,3)))).sort())
  await db.exec(readFileSync(new URL(name,root),'utf8'));
 const cat=new URL('../sql/catalog/',root);
 for(const name of readdirSync(cat).filter(n=>/^00[1-6]_.*\.sql$/.test(n)).sort())
  await db.exec(readFileSync(new URL('catalog/'+name,root),'utf8'));
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
   ($1,'campaign-owner@example.invalid','Owner','active',now(),'local'),
   ($2,'campaign-other@example.invalid','Other','active',now(),'local')`,[owner,other]);
 const campaignId=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'QA','' ,'hsc') RETURNING id`,[owner])).rows[0].id;
 const id=(await db.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,campaign_id,name,ruleset,data)
   VALUES('npcs',$1,$2,'Custode','hsc',$3::jsonb) RETURNING id`,[owner,campaignId,JSON.stringify({description:'Custodi',notes:'Conservare'})])).rows[0].id;
 await db.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,name,ruleset,data)
   VALUES('monsters',$1,'Mostro','hsc',$2::jsonb)`,[owner,JSON.stringify({})]);
 await db.exec('SET ROLE hollowgate_api_runtime;');
 const pool={query:(text,args)=>db.query(text,args)};
 return {db,service:createNativeCampaignCatalogService({pool}),campaign:campaignId};
}
test('native campaign projection lists assigned entries to the campaign owner and none to others',async()=>{
 const f=await fixture();
 try{
  const items=await f.service.list(owner,'npcs',f.campaign);
  assert.equal(items.length,1);
  assert.equal(items[0].kind,'npcs');
  assert.equal(items[0].ownerId,owner);
  assert.equal(items[0].campaignId,f.campaign);
  assert.equal(items[0].name,'Custode');
  assert.equal(items[0].ruleset,'hsc');
  assert.equal(items[0].status,'active');
  assert.equal(items[0].data.description,'Custodi');
  // Read-only path: no revision or data change, entry stays assigned.
  await f.db.exec('RESET ROLE');
  const row=(await f.db.query('SELECT revision,data FROM hollowgate_vtt.catalog_entities WHERE kind=$1 AND id=$2',
   ['npcs',items[0].id])).rows[0];
  assert.equal(row.revision,1);
  assert.equal(row.data.description,'Custodi');
  await f.db.exec('SET ROLE hollowgate_api_runtime');
  // Unassigned campaign has no entries for this kind.
  assert.deepEqual(await f.service.list(owner,'monsters',f.campaign),[]);
  // Other users see nothing.
  assert.deepEqual(await f.service.list(other,'npcs',f.campaign),[]);
  await assert.rejects(f.service.list(owner,'npcs','not-a-uuid'),e=>e.status===400);
 }finally{await f.db.close();}
});
