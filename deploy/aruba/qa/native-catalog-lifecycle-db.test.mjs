import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {once} from 'node:events';
import {createApp} from '../../../apps/aruba-api/src/app.mjs';
import {createAuthHttpHandler} from '../../../apps/aruba-api/src/auth-http.mjs';
import {createUnassignedCatalogService} from '../../../apps/aruba-api/src/unassigned-catalog-service.mjs';
import {createUnassignedCatalogNotesService} from '../../../apps/aruba-api/src/unassigned-catalog-notes-service.mjs';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const draft={name:'Custode',ruleset:'hsc',data:{description:'Originale',notes:'Conservare',tabOrder:['scheda']}};
async function fixture(){
 const db=new PGlite(),directory=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(directory).filter(n=>/^\d{3}_.*\.sql$/.test(n)&&Number(n.slice(0,3))<=38&&![35,36,37].includes(Number(n.slice(0,3)))).sort())
  await db.exec(readFileSync(new URL(name,directory),'utf8'));
 for(const name of readdirSync(new URL('catalog/',directory)).filter(n=>/^00[1-5]_.*\.sql$/.test(n)).sort())
  await db.exec(readFileSync(new URL('catalog/'+name,directory),'utf8'));
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
  ($1,'native-owner@example.invalid','Owner','active',now(),'local'),($2,'native-other@example.invalid','Other','active',now(),'local')`,[owner,other]);
 const campaigns=[];
 for(const [actor,ruleset] of [[owner,'hsc'],[owner,'hsc'],[other,'hsc'],[owner,'custom']])
  campaigns.push((await db.query("INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'QA','',$2) RETURNING id",[actor,ruleset])).rows[0].id);
 await db.exec('SET ROLE hollowgate_api_runtime');
 const pool={query:(sql,args)=>db.query(sql,args)};
 return {db,campaigns,service:createUnassignedCatalogService({pool,native:true}),
  old:createUnassignedCatalogService({pool}),notes:createUnassignedCatalogNotesService({pool,native:true}),
  oldNotes:createUnassignedCatalogNotesService({pool})};
}
const rejected=status=>error=>error.status===status;
test('native assignment and detachment preserve identity, media, notes and optimistic revision',async()=>{
 const {db,service,old,notes,campaigns}=await fixture();
 try{
  let {item}=await service.create(owner,'npcs',draft);const id=item.id;
  ({item}=await service.saveMedia(owner,'npcs',id,'portrait',{revision:item.revision,mimeType:'image/png',dataBase64:png}));
  ({item}=await notes.create(owner,'npcs',id,{revision:item.revision,tabName:'Radice'}));
  ({item}=await service.assign(owner,'npcs',id,{revision:item.revision,campaignId:campaigns[0]}));
  assert.equal(item.id,id);assert.equal(item.campaignId,campaigns[0]);assert.equal(item.media.length,1);
  await assert.rejects(old.read(owner,'npcs',id),rejected(404));
  assert.equal((await notes.list(owner,'npcs',id)).notes.length,1);
  ({item}=await service.save(owner,'npcs',id,{...draft,name:'Modificato',revision:item.revision}));
  assert.equal(item.campaignId,campaigns[0]);
  ({item}=await service.assign(owner,'npcs',id,{revision:item.revision,campaignId:null}));
  assert.equal(item.id,id);assert.equal(item.campaignId,null);assert.equal(item.name,'Modificato');
  assert.equal((await old.read(owner,'npcs',id)).item.id,id);
  assert.equal((await service.readMedia(owner,'npcs',id,'portrait')).dataBase64,png);
 }finally{await db.close();}
});
test('native moves reject foreign campaigns, incompatible rulesets and stale revisions',async()=>{
 const {db,service,campaigns}=await fixture();
 try{
  const {item}=await service.create(owner,'monsters',draft);
  for(const [target,status] of [[campaigns[2],404],[campaigns[3],400]])
   await assert.rejects(service.assign(owner,'monsters',item.id,{revision:1,campaignId:target}),rejected(status));
  const moved=await service.assign(owner,'monsters',item.id,{revision:1,campaignId:campaigns[0]});
  await assert.rejects(service.assign(owner,'monsters',item.id,{revision:1,campaignId:null}),rejected(409));
  const remapped=await service.assign(owner,'monsters',item.id,{revision:moved.item.revision,campaignId:campaigns[1]});
  assert.equal(remapped.item.id,item.id);assert.equal(remapped.item.campaignId,campaigns[1]);
  await assert.rejects(service.read(other,'monsters',item.id),rejected(404));
  await assert.rejects(service.archive(other,'monsters',item.id,{revision:remapped.item.revision}),rejected(404));
 }finally{await db.close();}
});
test('native archive keeps data/media/notes but closes both native and old unassigned APIs',async()=>{
 const {db,service,old,notes,oldNotes,campaigns}=await fixture();
 try{
  let {item}=await service.create(owner,'npcs',draft);const id=item.id;
  ({item}=await service.saveMedia(owner,'npcs',id,'portrait',{revision:item.revision,mimeType:'image/png',dataBase64:png}));
  const root=await notes.create(owner,'npcs',id,{revision:item.revision,tabName:'Radice'});item=root.item;
  const archived=await service.archive(owner,'npcs',id,{revision:item.revision});
  assert.equal(archived.item.status,'archived');assert.equal(archived.archivedId,id);
  for(const api of [service,old]){
   assert.equal((await api.list(owner,'npcs')).items.length,0);
   await assert.rejects(api.read(owner,'npcs',id),rejected(404));
   await assert.rejects(api.save(owner,'npcs',id,{...draft,revision:archived.item.revision}),rejected(404));
   await assert.rejects(api.readMedia(owner,'npcs',id,'portrait'),rejected(404));
   await assert.rejects(api.saveMedia(owner,'npcs',id,'portrait',{revision:archived.item.revision,mimeType:'image/png',dataBase64:png}),rejected(404));
   await assert.rejects(api.duplicate(owner,'npcs',id,{revision:archived.item.revision,requestId:crypto.randomUUID()}),rejected(404));
   await assert.rejects(api.copyToCampaign(owner,'npcs',id,{revision:archived.item.revision,targetCampaignId:campaigns[0]}),rejected(404));
  }
  for(const api of [notes,oldNotes]){
   await assert.rejects(api.list(owner,'npcs',id),rejected(404));
   await assert.rejects(api.create(owner,'npcs',id,{revision:archived.item.revision,tabName:'Vietata'}),rejected(404));
   await assert.rejects(api.archive(owner,'npcs',id,root.note.id,{revision:archived.item.revision}),rejected(404));
  }
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT status FROM hollowgate_vtt.catalog_entities WHERE id=$1',[id])).rows[0].status,'archived');
  for(const table of ['catalog_entity_notes','catalog_entity_media'])
   assert.equal((await db.query(`SELECT count(*)::int AS n FROM hollowgate_vtt.${table} WHERE entity_id=$1`,[id])).rows[0].n,1);
 }finally{await db.close();}
});
test('assigned native duplicates keep campaign and atomically remap note identities',async()=>{
 const {db,service,notes,campaigns}=await fixture();
 try{
  let {item}=await service.create(owner,'npcs',draft);
  const root=await notes.create(owner,'npcs',item.id,{revision:item.revision,tabName:'Radice'});item=root.item;
  ({item}=await notes.create(owner,'npcs',item.id,{revision:item.revision,tabName:'Figlio',parentId:root.note.id}));
  ({item}=await service.assign(owner,'npcs',item.id,{revision:item.revision,campaignId:campaigns[0]}));
  const copy=await service.duplicate(owner,'npcs',item.id,{revision:item.revision,requestId:crypto.randomUUID()});
  assert.notEqual(copy.item.id,item.id);assert.equal(copy.item.campaignId,campaigns[0]);
  const roots=await notes.list(owner,'npcs',copy.item.id);
  assert.notEqual(roots.notes[0].id,root.note.id);
  assert.equal((await notes.list(owner,'npcs',copy.item.id,roots.notes[0].id)).notes.length,1);
  const cross=await service.copyToCampaign(owner,'npcs',item.id,{revision:item.revision,targetCampaignId:campaigns[1]});
  assert.equal(cross.item.campaignId,campaigns[1]);assert.notEqual(cross.item.id,item.id);
  assert.equal((await service.read(owner,'npcs',item.id)).item.campaignId,campaigns[0]);
 }finally{await db.close();}
});
test('native lifecycle does not bypass logical PG assignment or grant runtime internal functions',async()=>{
 const {db,service,campaigns}=await fixture();
 try{
  const {item}=await service.create(owner,'characters',{name:'Mara',ruleset:'hsc',
   data:{style:'Jock',viaggio:'Campione',ambiti:{},abilita:{},tratti:[],equipment:[]}});
  await assert.rejects(service.assign(owner,'characters',item.id,{revision:item.revision,campaignId:campaigns[0]}),rejected(400));
  for(const signature of ['lock_native_catalog_entry(uuid,text,uuid,integer)',
   'copy_native_catalog_to_campaign_internal(uuid,text,uuid,uuid,integer)']){
   const {rows}=await db.query('SELECT has_function_privilege(current_user,$1,\'EXECUTE\') AS allowed',['hollowgate_vtt.'+signature]);
   assert.equal(rows[0].allowed,false);
  }
 }finally{await db.close();}
});
test('real native HTTP lifecycle uses cookie identity, Origin and restricted database routines',async()=>{
 const {db,service,notes,campaigns}=await fixture();
 const origin='https://www.hollowgate.quest',cookie='__Host-hg_session='+'A'.repeat(43);
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),
  revokeSession:async()=>{},nativeCatalog:service,nativeCatalogNotes:notes});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 const base='http://127.0.0.1:'+app.address().port;
 const headers={cookie,origin,'content-type':'application/json'};
 try{
  const path='/vtt/catalog/native/npcs';
  assert.equal((await fetch(base+path)).status,401);
  const created=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(draft)});
  assert.equal(created.status,201);let {item}=await created.json();
  const url=base+path+'/'+item.id;
  const body={revision:item.revision,campaignId:campaigns[0]};
  assert.equal((await fetch(url+'/assignment',{method:'PATCH',headers:{...headers,origin:'https://foreign.invalid'},body:JSON.stringify(body)})).status,403);
  const assigned=await fetch(url+'/assignment',{method:'PATCH',headers,body:JSON.stringify(body)});
  assert.equal(assigned.status,200);({item}=await assigned.json());
  const roots=await fetch(url+'/notes',{method:'POST',headers,body:JSON.stringify({revision:item.revision,tabName:'Nota assegnata'})});
  assert.equal(roots.status,201);({item}=await roots.json());
  const archived=await fetch(url,{method:'DELETE',headers,body:JSON.stringify({revision:item.revision})});
  assert.equal(archived.status,200);assert.equal((await archived.json()).item.status,'archived');
  assert.equal((await fetch(url,{headers:{cookie}})).status,404);
 }finally{await new Promise(resolve=>app.close(resolve));await db.close();}
});
