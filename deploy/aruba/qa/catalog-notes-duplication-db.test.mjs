// Actual migrations + PostgreSQL + restricted runtime role + real HTTP. No VPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {createUnassignedCatalogService} from '../../../apps/aruba-api/src/unassigned-catalog-service.mjs';
import {createUnassignedCatalogNotesService} from '../../../apps/aruba-api/src/unassigned-catalog-notes-service.mjs';
import {createAuthHttpHandler} from '../../../apps/aruba-api/src/auth-http.mjs';
import {createApp} from '../../../apps/aruba-api/src/app.mjs';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
const body=kind=>({name:'Custode',ruleset:'hsc',data:kind==='characters'?
 {style:'Jock',viaggio:'Campione',ambiti:{Fisico:1},abilita:{},tratti:[],equipment:[],tabOrder:['scheda','token']}:
 {description:'Originale',tabOrder:['scheda','token']}});
const bad=status=>error=>error.status===status;
async function fixture(){
 const db=new PGlite(),dir=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(dir).filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=34).sort())
  await db.exec(readFileSync(new URL(name,dir),'utf8'));
 for(const name of ['001_unassigned_catalog.sql','002_notes_and_duplication.sql'])
  await db.exec(readFileSync(new URL('catalog/'+name,dir),'utf8'));
 for(const [id,label] of [[owner,'owner'],[other,'other']])await db.query(`INSERT INTO hollowgate_auth.users
  (id,email,display_name,status,email_verified_at,source) VALUES($1,$2,$3,'active',now(),'local')`,[id,`native-notes-${label}@example.invalid`,label]);
 await db.exec('SET ROLE hollowgate_api_runtime;');
 const pool={query:(sql,args)=>db.query(sql,args)};
 return {db,catalog:createUnassignedCatalogService({pool}),notes:createUnassignedCatalogNotesService({pool})};
}
async function state(f,kind='characters'){
 const s={...f,kind,item:(await f.catalog.create(owner,kind,body(kind))).item};
 s.add=async(tabName,parentId=null)=>{
  const result=await f.notes.create(owner,kind,s.item.id,{revision:s.item.revision,tabName,parentId});s.item=result.item;return result.note;
 };
 s.save=async(note,patch={})=>{
  const result=await f.notes.save(owner,kind,s.item.id,note.id,{revision:s.item.revision,tabName:note.tab_name,
   content:note.content,contentRich:note.content_rich,position:note.position,hidden:note.hidden,visibility:note.visibility,...patch});
  s.item=result.item;return result.note;
 };
 return s;
}
async function counts(db){
 await db.exec('RESET ROLE;');
 const result={};
 for(const table of ['catalog_entities','catalog_entity_media','catalog_entity_notes','catalog_duplicate_requests'])
  result[table]=(await db.query(`SELECT count(*)::int AS n FROM hollowgate_vtt.${table}`)).rows[0].n;
 await db.exec('SET ROLE hollowgate_api_runtime;');return result;
}

for(const kind of ['characters','npcs','monsters'])test(`${kind}: duplicates sheet, all media, hidden/private notes, two-level graph and structural tab order atomically`,async()=>{
 const f=await fixture();
 try{
  const s=await state(f,kind);
  const root=await s.add('Segreti'),second=await s.add('Seconda');
  const a=await s.add('Prima sotto-tab',root.id),b=await s.add('Seconda sotto-tab',root.id);
  const rich={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Riferimento letterale '+root.id}]}]};
  await s.save(root,{hidden:true,visibility:'private',content:'Legacy intatto',contentRich:rich});
  await s.save(a,{content:'Sotto-tab',hidden:true,visibility:'private',contentRich:rich});
  s.item=(await f.notes.reorder(owner,kind,s.item.id,root.id,{revision:s.item.revision,tabOrder:[b.id,a.id]})).item;
  s.item=(await f.catalog.save(owner,kind,s.item.id,{...body(kind),revision:s.item.revision,
   data:{...s.item.data,tabOrder:['scheda',second.id,'token',root.id]}})).item;
  for(const role of ['portrait','source','cover'])s.item=(await f.catalog.saveMedia(owner,kind,s.item.id,role,
   {revision:s.item.revision,mimeType:'image/png',dataBase64:png})).item;
  const source=structuredClone(s.item),request={revision:source.revision,requestId:randomUUID()};
  const {item:copy}=await f.catalog.duplicate(owner,kind,source.id,request);
  assert.notEqual(copy.id,source.id);assert.equal(copy.name,'Copia di '+source.name);
  assert.equal(copy.ownerId,owner);assert.equal(copy.campaignId,null);assert.equal(copy.revision,1);
  assert.equal(copy.media.length,3);
  const roots=(await f.notes.list(owner,kind,copy.id)).notes;
  assert.equal(roots.length,2);
  const copiedRoot=roots.find(n=>n.tab_name==='Segreti'),copiedSecond=roots.find(n=>n.tab_name==='Seconda');
  assert.notEqual(copiedRoot.id,root.id);assert.notEqual(copiedSecond.id,second.id);
  assert.equal(copiedRoot.hidden,true);assert.equal(copiedRoot.visibility,'private');
  assert.deepEqual(copiedRoot.content_rich,rich);assert.equal(copiedRoot.content,'Legacy intatto');
  const children=(await f.notes.list(owner,kind,copy.id,copiedRoot.id)).notes;
  assert.equal(children.length,2);
  const copiedA=children.find(n=>n.tab_name===a.tab_name),copiedB=children.find(n=>n.tab_name===b.tab_name);
  assert.deepEqual(copiedRoot.tab_order,[copiedB.id,copiedA.id]);
  assert.equal(copiedA.parent_note_id,copiedRoot.id);assert.equal(copiedA.hidden,true);assert.equal(copiedA.visibility,'private');
  assert.deepEqual(copiedA.content_rich,rich);
  assert.deepEqual(copy.data.tabOrder,['scheda',copiedSecond.id,'token',copiedRoot.id]);
  for(const role of ['portrait','source','cover'])assert.equal((await f.catalog.readMedia(owner,kind,copy.id,role)).dataBase64,png);
  assert.deepEqual((await f.catalog.read(owner,kind,source.id)).item,source);
  assert.equal((await f.catalog.duplicate(owner,kind,source.id,request)).item.id,copy.id);
  assert.deepEqual(await counts(f.db),{catalog_entities:2,catalog_entity_media:6,catalog_entity_notes:8,catalog_duplicate_requests:1});
 }finally{await f.db.close();}
});

test('note graph rejects cross-entity parents, third levels, foreign ownership and incomplete/duplicate child orders',async()=>{
 const f=await fixture();
 try{
  const s=await state(f),another=await state(f),root=await s.add('Padre'),child=await s.add('Figlio',root.id);
  const before=await counts(f.db);
  for(const parentId of [root.id,child.id])await assert.rejects(()=>f.notes.create(owner,s.kind,another.item.id,
   {revision:another.item.revision,tabName:'Invalida',parentId}),bad(404));
  await assert.rejects(()=>f.notes.create(owner,s.kind,s.item.id,{revision:s.item.revision,tabName:'Terzo livello',parentId:child.id}),bad(404));
  await assert.rejects(()=>f.notes.list(other,s.kind,s.item.id),bad(404));
  await assert.rejects(()=>f.notes.save(other,s.kind,s.item.id,child.id,{revision:s.item.revision,tabName:'X',content:'',contentRich:null,position:0,hidden:false,visibility:'all'}),bad(404));
  await assert.rejects(()=>f.notes.reorder(owner,s.kind,s.item.id,root.id,{revision:s.item.revision,tabOrder:[]}),bad(404));
  await assert.rejects(()=>f.notes.reorder(owner,s.kind,s.item.id,root.id,{revision:s.item.revision,tabOrder:[child.id,child.id]}),bad(400));
  assert.deepEqual(await counts(f.db),before);
  await f.db.exec('RESET ROLE;');
  await assert.rejects(()=>f.db.query(`INSERT INTO hollowgate_vtt.catalog_entity_notes(kind,entity_id,parent_note_id,created_by,tab_name,position)
   VALUES('characters',$1,$2,$3,'Grandchild',0)`,[s.item.id,child.id,owner]),/Invalid catalog note parent/);
 }finally{await f.db.close();}
});

test('archiving child/root notes preserves archived data, prunes orders, and excludes archived trees from duplication',async()=>{
 const f=await fixture();
 try{
  const s=await state(f),root=await s.add('Padre'),child=await s.add('Figlio',root.id),kept=await s.add('Conservata');
  s.item=(await f.notes.reorder(owner,s.kind,s.item.id,root.id,{revision:s.item.revision,tabOrder:[child.id]})).item;
  s.item=(await f.notes.archive(owner,s.kind,s.item.id,child.id,{revision:s.item.revision})).item;
  assert.deepEqual((await f.notes.list(owner,s.kind,s.item.id)).notes.find(n=>n.id===root.id).tab_order,[]);
  const extra=await s.add('Altro figlio',root.id);
  assert.equal(extra.parent_note_id,root.id);
  s.item=(await f.notes.archive(owner,s.kind,s.item.id,root.id,{revision:s.item.revision})).item;
  assert.deepEqual(s.item.data.tabOrder,['scheda','token',kept.id]);
  await assert.rejects(()=>f.notes.list(owner,s.kind,s.item.id,root.id),bad(404));
  const copy=(await f.catalog.duplicate(owner,s.kind,s.item.id,{revision:s.item.revision,requestId:randomUUID()})).item;
  const copiedNotes=(await f.notes.list(owner,s.kind,copy.id)).notes;
  assert.deepEqual(copiedNotes.map(n=>n.tab_name),['Conservata']);
  await f.db.exec('RESET ROLE;');
  assert.equal((await f.db.query("SELECT count(*)::int AS n FROM hollowgate_vtt.catalog_entity_notes WHERE status='archived'")).rows[0].n,3);
 }finally{await f.db.close();}
});

test('shared revision prevents note/sheet/media stale saves; duplicate retry is idempotent even after source changes',async()=>{
 const f=await fixture();
 try{
  const s=await state(f),revision=s.item.revision;
  // Serialized PGlite proves compare-and-swap, not multi-connection locking.
  const changes=await Promise.allSettled(['A','B'].map(tabName=>f.notes.create(owner,s.kind,s.item.id,{revision,tabName})));
  assert.equal(changes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(changes.find(r=>r.status==='rejected').reason.status,409);
  s.item=(await f.catalog.read(owner,s.kind,s.item.id)).item;
  await assert.rejects(()=>f.catalog.save(owner,s.kind,s.item.id,{...body(s.kind),revision}),bad(409));
  await assert.rejects(()=>f.catalog.saveMedia(owner,s.kind,s.item.id,'portrait',{revision,mimeType:'image/png',dataBase64:png}),bad(409));
  const request={revision:s.item.revision,requestId:randomUUID()};
  const copy=(await f.catalog.duplicate(owner,s.kind,s.item.id,request)).item;
  await s.add('Dopo la copia');
  assert.equal((await f.catalog.duplicate(owner,s.kind,s.item.id,request)).item.id,copy.id);
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,{...request,revision:s.item.revision}),bad(400));
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,{revision:request.revision,requestId:randomUUID()}),bad(409));
  assert.equal((await counts(f.db)).catalog_entities,2);
 }finally{await f.db.close();}
});

test('failure during note copy rolls back entity, already-copied media and idempotency receipt, then retry succeeds',async()=>{
 const f=await fixture();
 try{
  const s=await state(f);await s.add('Blocca copia');
  s.item=(await f.catalog.saveMedia(owner,s.kind,s.item.id,'portrait',{revision:s.item.revision,mimeType:'image/png',dataBase64:png})).item;
  const request={revision:s.item.revision,requestId:randomUUID()},before=await counts(f.db);
  await f.db.exec('RESET ROLE;');
  await f.db.exec(`CREATE FUNCTION hollowgate_vtt.qa_fail_copy() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF NEW.entity_id<>'${s.item.id}'::uuid THEN RAISE EXCEPTION 'Synthetic copy failure' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
   CREATE TRIGGER qa_fail_copy BEFORE INSERT ON hollowgate_vtt.catalog_entity_notes FOR EACH ROW EXECUTE FUNCTION hollowgate_vtt.qa_fail_copy();
   SET ROLE hollowgate_api_runtime;`);
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,request),bad(400));
  assert.deepEqual(await counts(f.db),before);
  assert.deepEqual((await f.catalog.read(owner,s.kind,s.item.id)).item,s.item);
  await f.db.exec('RESET ROLE; DROP TRIGGER qa_fail_copy ON hollowgate_vtt.catalog_entity_notes; SET ROLE hollowgate_api_runtime;');
  const copy=(await f.catalog.duplicate(owner,s.kind,s.item.id,request)).item;
  assert.equal(copy.media.length,1);assert.equal((await f.notes.list(owner,s.kind,copy.id)).notes.length,1);
  assert.equal((await counts(f.db)).catalog_duplicate_requests,1);
 }finally{await f.db.close();}
});

test('retry keys cannot be reused for another source or expose a copied entity after assignment/ownership change',async()=>{
 const f=await fixture();
 try{
  const s=await state(f),second=await state(f),request={revision:s.item.revision,requestId:randomUUID()};
  const copy=(await f.catalog.duplicate(owner,s.kind,s.item.id,request)).item,before=await counts(f.db);
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,second.item.id,request),bad(400));
  await f.db.exec('RESET ROLE;');
  const campaign=(await f.db.query("INSERT INTO hollowgate_vtt.campaigns(owner_id,name,ruleset) VALUES($1,'Receipt QA','hsc') RETURNING id",[owner])).rows[0].id;
  await f.db.query('UPDATE hollowgate_vtt.catalog_entities SET campaign_id=$1 WHERE id=$2',[campaign,copy.id]);
  await f.db.exec('SET ROLE hollowgate_api_runtime;');
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,request),bad(404));
  await f.db.exec('RESET ROLE;');
  await f.db.query('UPDATE hollowgate_vtt.catalog_entities SET campaign_id=NULL,owner_id=$1 WHERE id=$2',[other,copy.id]);
  await f.db.exec('SET ROLE hollowgate_api_runtime;');
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,request),bad(404));
  assert.deepEqual(await counts(f.db),before);
 }finally{await f.db.close();}
});

test('copy reconciles structural orders only against the correct root/child scope, never edits literal note content',async()=>{
 const f=await fixture();
 try{
  const s=await state(f),root=await s.add('Root'),otherRoot=await s.add('Other root');
  const a=await s.add('A',root.id),b=await s.add('B',otherRoot.id),stale=randomUUID();
  s.item=(await f.catalog.save(owner,s.kind,s.item.id,{...body(s.kind),revision:s.item.revision,
   data:{...s.item.data,tabOrder:['scheda',otherRoot.id,a.id,stale,root.id]}})).item;
  await f.db.exec('RESET ROLE;');
  await f.db.query('UPDATE hollowgate_vtt.catalog_entity_notes SET tab_order=$1 WHERE id=$2',[JSON.stringify([a.id,b.id,otherRoot.id,stale]),root.id]);
  await f.db.exec('SET ROLE hollowgate_api_runtime;');
  const copy=(await f.catalog.duplicate(owner,s.kind,s.item.id,{revision:s.item.revision,requestId:randomUUID()})).item;
  const roots=(await f.notes.list(owner,s.kind,copy.id)).notes;
  const copiedRoot=roots.find(n=>n.tab_name==='Root'),copiedOther=roots.find(n=>n.tab_name==='Other root');
  assert.deepEqual(copy.data.tabOrder,['scheda',copiedOther.id,copiedRoot.id]);
  const children=(await f.notes.list(owner,s.kind,copy.id,copiedRoot.id)).notes;
  assert.deepEqual(copiedRoot.tab_order,[children[0].id]);
  assert.deepEqual((await f.catalog.read(owner,s.kind,s.item.id)).item,s.item);
 }finally{await f.db.close();}
});

test('notes/receipts/helpers are inaccessible directly, and revoked/assigned sources cannot be copied or read through notes',async()=>{
 const f=await fixture();
 try{
  const s=await state(f);await s.add('Nota');
  for(const table of ['catalog_entity_notes','catalog_duplicate_requests'])await assert.rejects(()=>f.db.query('SELECT * FROM hollowgate_vtt.'+table),/permission denied/);
  await assert.rejects(()=>f.db.query('SELECT hollowgate_vtt.lock_unassigned_catalog_entry($1,$2,$3,$4)',[owner,s.kind,s.item.id,s.item.revision]),/permission denied/);
  await assert.rejects(()=>f.catalog.duplicate(other,s.kind,s.item.id,{revision:s.item.revision,requestId:randomUUID()}),bad(404));
  await f.db.exec('RESET ROLE;');
  const campaign=(await f.db.query("INSERT INTO hollowgate_vtt.campaigns(owner_id,name,ruleset) VALUES($1,'QA','hsc') RETURNING id",[owner])).rows[0].id;
  await f.db.query('UPDATE hollowgate_vtt.catalog_entities SET campaign_id=$1 WHERE id=$2',[campaign,s.item.id]);
  await f.db.exec('SET ROLE hollowgate_api_runtime;');
  await assert.rejects(()=>f.notes.list(owner,s.kind,s.item.id),bad(404));
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,{revision:s.item.revision,requestId:randomUUID()}),bad(404));
  await f.db.exec('RESET ROLE;');await f.db.query('UPDATE hollowgate_vtt.catalog_entities SET campaign_id=NULL WHERE id=$1',[s.item.id]);
  await f.db.query("UPDATE hollowgate_auth.users SET status='pending_reset' WHERE id=$1",[owner]);await f.db.exec('SET ROLE hollowgate_api_runtime;');
  await assert.rejects(()=>f.notes.list(owner,s.kind,s.item.id),bad(404));
  await assert.rejects(()=>f.notes.create(owner,s.kind,s.item.id,{revision:s.item.revision,tabName:'Revocata'}),bad(404));
  await assert.rejects(()=>f.catalog.duplicate(owner,s.kind,s.item.id,{revision:s.item.revision,requestId:randomUUID()}),bad(404));
 }finally{await f.db.close();}
});

test('sibling cap is explicit and duplicate names preserve the original prefix within the safety bound',async()=>{
 const f=await fixture();
 try{
  const s=await state(f);
  await f.db.exec('RESET ROLE;');
  await f.db.query(`INSERT INTO hollowgate_vtt.catalog_entity_notes(kind,entity_id,created_by,tab_name,position)
   SELECT 'characters',$1,$2,'Tab '||i,i FROM generate_series(0,99) i`,[s.item.id,owner]);
  await f.db.exec('SET ROLE hollowgate_api_runtime;');
  assert.equal((await f.notes.list(owner,s.kind,s.item.id)).notes.length,100);
  await assert.rejects(()=>f.notes.create(owner,s.kind,s.item.id,{revision:s.item.revision,tabName:'Oltre limite'}),bad(400));
  const long=(await f.catalog.create(owner,'characters',{...body('characters'),name:'N'.repeat(120)})).item;
  const longCopy=(await f.catalog.duplicate(owner,'characters',long.id,{revision:long.revision,requestId:randomUUID()})).item;
  assert.equal(longCopy.name,'Copia di '+'N'.repeat(120));
  const bound=(await f.catalog.create(owner,'characters',{...body('characters'),name:'B'.repeat(500)})).item;
  const boundCopy=(await f.catalog.duplicate(owner,'characters',bound.id,{revision:bound.revision,requestId:randomUUID()})).item;
  assert.equal(boundCopy.name.length,500);assert.ok(boundCopy.name.startsWith('Copia di BBB'));
  assert.deepEqual((await f.catalog.read(owner,'characters',bound.id)).item,bound);
 }finally{await f.db.close();}
});

test('new HTTP notes and duplicate use cookie actor, exact Origin, revision and retry identity against real PostgreSQL',async()=>{
 const f=await fixture(),s=await state(f,'npcs'),origin='https://www.hollowgate.quest';
 const token='A'.repeat(43),cookie='__Host-hg_session='+token;
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async value=>value===token?{id:owner}:null,revokeSession:async()=>{},unassignedCatalog:f.catalog,unassignedCatalogNotes:f.notes});
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});app.listen(0,'127.0.0.1');await once(app,'listening');
 try{
  const base='http://127.0.0.1:'+app.address().port+'/vtt/catalog/unassigned/npcs/'+s.item.id;
  const headers={cookie,origin,'content-type':'application/json'};
  assert.equal((await fetch(base+'/notes')).status,401);
  const input={revision:s.item.revision,tabName:'HTTP'};
  assert.equal((await fetch(base+'/notes',{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:JSON.stringify(input)})).status,403);
  const created=await fetch(base+'/notes',{method:'POST',headers,body:JSON.stringify(input)});
  assert.equal(created.status,201);assert.equal(created.headers.get('cache-control'),'no-store');
  const createdNote=await created.json();
  const note=createdNote.note,item=createdNote.item;
  const updated=await fetch(base+'/notes/'+note.id,{method:'PUT',headers,body:JSON.stringify({revision:item.revision,tabName:'HTTP',content:'Testo',contentRich:null,position:0,hidden:true,visibility:'private'})});
  assert.equal(updated.status,200);
  const current=(await updated.json()).item;
  assert.equal((await fetch(base+'/notes?ownerId='+other,{headers:{cookie}})).status,400);
  assert.equal((await fetch(base+'/notes?parentId='+note.id+'&parentId='+note.id,{headers:{cookie}})).status,400);
  const request={revision:current.revision,requestId:randomUUID()};
  const dup=await fetch(base+'/duplicate',{method:'POST',headers,body:JSON.stringify(request)});
  assert.equal(dup.status,200);const copy=(await dup.json()).item;
  const replay=await fetch(base+'/duplicate',{method:'POST',headers,body:JSON.stringify(request)});
  assert.equal((await replay.json()).item.id,copy.id);
  assert.equal((await f.notes.list(owner,'npcs',copy.id)).notes[0].hidden,true);
  const removed=await fetch(base+'/notes/'+note.id,{method:'DELETE',headers,body:JSON.stringify({revision:current.revision})});
  assert.equal(removed.status,200);assert.deepEqual((await f.notes.list(owner,'npcs',s.item.id)).notes,[]);
 }finally{await new Promise(resolve=>app.close(resolve));await f.db.close();}
});
