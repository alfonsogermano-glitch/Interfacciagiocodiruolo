// In-memory PostgreSQL, actual SQL + restricted role + real service/HTTP.
// No VPS, credentials, exports or active databases are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {createUnassignedCatalogService} from '../../../apps/aruba-api/src/unassigned-catalog-service.mjs';
import {createAuthHttpHandler} from '../../../apps/aruba-api/src/auth-http.mjs';
import {createApp} from '../../../apps/aruba-api/src/app.mjs';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const unverified='00000000-0000-4000-8000-000000000003';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const body=kind=>({name:kind==='characters'?'Mara':'Custode',ruleset:'hsc',data:kind==='characters'?
 {style:'Jock',viaggio:'Campione',ambiti:{Fisico:1},abilita:{},tratti:[],equipment:[],tabOrder:['scheda']}:
 {description:'Dato originale',notes:'Note',tabOrder:['scheda'],freschezza:12,attacco:'Base'}});
async function fixture(){
 const db=new PGlite();
 const directory=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=38&&![35,36,37].includes(Number(name.slice(0,3)))).sort())
  await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.exec(readFileSync(new URL('catalog/001_unassigned_catalog.sql',directory),'utf8'));
 for(const [id,label,verified] of [[owner,'owner',true],[other,'other',true],[unverified,'unverified',false]])
  await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source)
   VALUES($1,$2,$3,'active',CASE WHEN $4 THEN now() ELSE NULL END,'local')`,[id,`catalog-${label}@example.invalid`,label,verified]);
 await db.exec('SET ROLE hollowgate_api_runtime;');
 return {db,service:createUnassignedCatalogService({pool:{query:(text,args)=>db.query(text,args)}})};
}
const rejected=status=>error=>error.status===status;

test('all three native kinds create/read/update with NULL campaign and explicit logical ownership',async()=>{
 const {db,service}=await fixture();
 try{
  for(const kind of ['characters','npcs','monsters']){
   const draft=body(kind),{item}=await service.create(owner,kind,draft);
   assert.equal(item.ownerId,owner);assert.equal(item.kind,kind);assert.equal(item.campaignId,null);
   assert.equal(item.revision,1);assert.deepEqual(item.data,draft.data);assert.deepEqual(item.media,[]);
   assert.equal((await service.read(owner,kind,item.id)).item.id,item.id);
   const saved=await service.save(owner,kind,item.id,{...draft,name:'Modificato',revision:1});
   assert.equal(saved.item.revision,2);assert.equal(saved.item.name,'Modificato');
   assert.equal(saved.item.createdAt,item.createdAt);
   assert.equal((await service.list(owner,kind)).items.length,1);
   await assert.rejects(()=>service.read(other,kind,item.id),rejected(404));
   assert.deepEqual(await service.list(other,kind),{items:[],nextCursor:null});
  }
  await db.exec('RESET ROLE;');
  for(const table of ['campaigns','character_drafts','character_claims','character_player_assignments'])
   assert.equal((await db.query(`SELECT count(*)::int AS n FROM hollowgate_vtt.${table}`)).rows[0].n,0);
 }finally{await db.close();}
});

test('revision compare-and-swap refuses overlapping/stale edits without losing confirmed data',async()=>{
 const {db,service}=await fixture();
 try{
  const draft=body('characters'),{item}=await service.create(owner,'characters',draft);
  // PGlite serializes statements: proves CAS behavior, not independent-server
  // lock contention. Multi-connection PostgreSQL race QA is still required.
  const results=await Promise.allSettled(['Prima','Seconda'].map(name=>service.save(owner,'characters',item.id,{...draft,name,revision:1})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
  const current=(await service.read(owner,'characters',item.id)).item;
  assert.equal(current.revision,2);
  await assert.rejects(()=>service.save(other,'characters',item.id,{...draft,revision:1}),rejected(404));
  assert.deepEqual((await service.read(owner,'characters',item.id)).item,current);
 }finally{await db.close();}
});

test('media lives with the entity, never needs a campaign and shares the revision guard',async()=>{
 const {db,service}=await fixture();
 try{
  const {item}=await service.create(owner,'npcs',body('npcs'));
  for(const [index,role] of ['portrait','source','cover'].entries()){
   const saved=await service.saveMedia(owner,'npcs',item.id,role,{mimeType:'image/png',dataBase64:png,revision:index+1});
   assert.equal(saved.item.campaignId,null);assert.equal(saved.item.revision,index+2);
   assert.equal(saved.item.media.length,index+1);
   assert.equal((await service.readMedia(owner,'npcs',item.id,role)).dataBase64,png);
   await assert.rejects(()=>service.readMedia(other,'npcs',item.id,role),rejected(404));
   await assert.rejects(()=>service.saveMedia(other,'npcs',item.id,role,{mimeType:'image/png',dataBase64:png,revision:index+2}),rejected(404));
  }
  await assert.rejects(()=>service.saveMedia(owner,'npcs',item.id,'portrait',{mimeType:'image/png',dataBase64:png,revision:1}),rejected(409));
  await assert.rejects(()=>db.query('SELECT * FROM hollowgate_vtt.catalog_entity_media'),/permission denied/i);
  // Deliberately bypass the JS contract. The DB rejects invalid media and
  // rolls back the entire statement, including the entity revision.
  await assert.rejects(()=>db.query('SELECT hollowgate_vtt.save_unassigned_catalog_media($1,$2,$3,4,$4,$5,$6)',
   [owner,'npcs',item.id,'portrait','image/png',Buffer.alloc(32)]),/Invalid catalog media signature/);
  assert.equal((await service.read(owner,'npcs',item.id)).item.revision,4);
  assert.equal((await service.readMedia(owner,'npcs',item.id,'portrait')).dataBase64,png);
  // Force a failure AFTER the media upsert: the parent's bounded revision
  // cannot advance. PostgreSQL must roll back the binary replacement too.
  await db.exec('RESET ROLE;');
  await db.query('UPDATE hollowgate_vtt.catalog_entities SET revision=2147483646 WHERE id=$1',[item.id]);
  await db.exec('SET ROLE hollowgate_api_runtime;');
  const changed=Buffer.concat([Buffer.from(png,'base64'),Buffer.from([0])]).toString('base64');
  await assert.rejects(()=>service.saveMedia(owner,'npcs',item.id,'portrait',
   {mimeType:'image/png',dataBase64:changed,revision:2147483646}),rejected(400));
  assert.equal((await service.read(owner,'npcs',item.id)).item.revision,2147483646);
  assert.equal((await service.readMedia(owner,'npcs',item.id,'portrait')).dataBase64,png);
 }finally{await db.close();}
});

test('restricted DB routines reject payload authority and direct table/helper access; revoked actors lose reads and writes',async()=>{
 const {db,service}=await fixture();
 try{
  const {item}=await service.create(owner,'monsters',body('monsters'));
  await assert.rejects(()=>db.query('SELECT * FROM hollowgate_vtt.catalog_entities'),/permission denied/i);
  await assert.rejects(()=>db.query('SELECT hollowgate_vtt.catalog_actor_active($1)',[owner]),/permission denied/i);
  for(const key of ['ownerId','campaignId','sourceRecord','availableForPlayers','portraitImageUrl']){
   await assert.rejects(()=>db.query('SELECT hollowgate_vtt.save_unassigned_catalog_entry($1,$2,$3,1,$4,$5,$6)',
    [owner,'monsters',item.id,'Custode','hsc',{[key]:other}]),/check constraint/i);
  }
  await assert.rejects(()=>service.create(unverified,'npcs',body('npcs')),rejected(404));
  await db.exec('RESET ROLE;');
  await db.query("UPDATE hollowgate_auth.users SET status='pending_reset' WHERE id=$1",[owner]);
  await db.exec('SET ROLE hollowgate_api_runtime;');
  assert.deepEqual(await service.list(owner,'monsters'),{items:[],nextCursor:null});
  await assert.rejects(()=>service.read(owner,'monsters',item.id),rejected(404));
  await assert.rejects(()=>service.save(owner,'monsters',item.id,{...body('monsters'),revision:1}),rejected(404));
 }finally{await db.close();}
});

test('explicit continuation reads all 205 items without silent truncation or cross-owner leakage',async()=>{
 const {db,service}=await fixture();
 try{
  await db.exec('RESET ROLE;');
  await db.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,id,owner_id,name,ruleset,data)
   SELECT 'npcs',lpad(to_hex(i),32,'0')::uuid,$1,'PNG '||i,'hsc','{}'::jsonb FROM generate_series(1,205) i`,[owner]);
  await db.exec('SET ROLE hollowgate_api_runtime;');
  const first=await service.list(owner,'npcs'),second=await service.list(owner,'npcs',first.nextCursor),third=await service.list(owner,'npcs',second.nextCursor);
  assert.deepEqual([first.items.length,second.items.length,third.items.length],[100,100,5]);
  assert.equal(third.nextCursor,null);
  assert.equal(new Set([...first.items,...second.items,...third.items].map(item=>item.id)).size,205);
  assert.deepEqual(await service.list(other,'npcs',first.nextCursor),{items:[],nextCursor:null});
 }finally{await db.close();}
});

test('unassigned routines cannot bypass the campaign-scoped boundary of a future assigned entry',async()=>{
 const {db,service}=await fixture();
 try{
  const {item}=await service.create(owner,'npcs',body('npcs'));
  await db.exec('RESET ROLE;');
  const campaign=(await db.query("INSERT INTO hollowgate_vtt.campaigns(owner_id,name,ruleset) VALUES($1,'Fixture assegnata','hsc') RETURNING id",[owner])).rows[0].id;
  await db.query('UPDATE hollowgate_vtt.catalog_entities SET campaign_id=$1 WHERE id=$2',[campaign,item.id]);
  await db.exec('SET ROLE hollowgate_api_runtime;');
  assert.deepEqual(await service.list(owner,'npcs'),{items:[],nextCursor:null});
  await assert.rejects(()=>service.read(owner,'npcs',item.id),rejected(404));
  await assert.rejects(()=>service.save(owner,'npcs',item.id,{...body('npcs'),revision:1}),rejected(404));
  await assert.rejects(()=>service.saveMedia(owner,'npcs',item.id,'portrait',{mimeType:'image/png',dataBase64:png,revision:1}),rejected(404));
 }finally{await db.close();}
});

test('real HTTP -> cookie actor -> restricted PostgreSQL service supports null-campaign data/media and rejects CSRF',async()=>{
 const {db,service}=await fixture();
 const origin='https://www.hollowgate.quest',cookie='__Host-hg_session='+'A'.repeat(43);
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},unassignedCatalog:service});
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});server.listen(0,'127.0.0.1');
 await once(server,'listening');
 try{
  const base='http://127.0.0.1:'+server.address().port+'/vtt/catalog/unassigned/npcs';
  assert.equal((await fetch(base)).status,401);
  const headers={cookie,origin,'content-type':'application/json'};
  assert.equal((await fetch(base,{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:JSON.stringify(body('npcs'))})).status,403);
  const created=await fetch(base,{method:'POST',headers,body:JSON.stringify(body('npcs'))});
  assert.equal(created.status,201);assert.equal(created.headers.get('cache-control'),'no-store');
  const {item}=await created.json();assert.equal(item.campaignId,null);assert.equal(item.ownerId,owner);
  const update={...body('npcs'),revision:1};
  assert.equal((await fetch(base+'/'+item.id,{method:'PUT',headers,body:JSON.stringify(update)})).status,200);
  assert.equal((await fetch(base+'/'+item.id,{method:'PUT',headers,body:JSON.stringify(update)})).status,409);
  const media=await fetch(base+'/'+item.id+'/media/portrait',{method:'PUT',headers,body:JSON.stringify({mimeType:'image/png',dataBase64:png,revision:2})});
  assert.equal(media.status,200);
  const image=await fetch(base+'/'+item.id+'/media/portrait',{headers:{cookie}});
  assert.equal(image.headers.get('cache-control'),'no-store');assert.equal((await image.json()).dataBase64,png);
  assert.equal((await fetch(base+'?ownerId='+other,{headers:{cookie}})).status,400);
  assert.equal((await fetch(base+'?after='+item.id+'&after='+item.id,{headers:{cookie}})).status,400);
  assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({...body('npcs'),ownerId:other})})).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));await db.close();}
});

test('existing claim/release/revocation and assignment SQL regressions still pass beside the new catalog',async()=>{
 const {db,service}=await fixture();
 try{
  const created=(await service.create(owner,'characters',body('characters'))).item;
  await db.exec('RESET ROLE;');
  for(const name of ['test_vtt_character_claims.sql','test_vtt_character_player_assignments.sql'])
   await db.exec(readFileSync(new URL('../sql/'+name,import.meta.url),'utf8'));
  await db.exec('SET ROLE hollowgate_api_runtime;');
  assert.deepEqual((await service.read(owner,'characters',created.id)).item,created);
 }finally{await db.close();}
});
