// In-memory PostgreSQL: root migrations 001-039 + catalog 001-007.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createNativeGlobalEditorService} from '../../../apps/aruba-api/src/native-global-editor-service.mjs';

const owner='21000000-0000-4000-8000-000000000001';
const other='21000000-0000-4000-8000-000000000002';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=';
async function fixture(){
 const db=new PGlite();
 const root=new URL('../sql/',import.meta.url);
 for(const name of readdirSync(root).filter(n=>/^\d{3}_.*\.sql$/.test(n)&&Number(n.slice(0,3))<=39&&![35,36,37].includes(Number(n.slice(0,3)))).sort())
  await db.exec(readFileSync(new URL(name,root),'utf8'));
 const cat=new URL('../sql/catalog/',root);
 for(const name of readdirSync(cat).filter(n=>/^00[1-7]_.*\.sql$/.test(n)).sort())
  await db.exec(readFileSync(new URL('catalog/'+name,root),'utf8'));
 await db.query(`INSERT INTO hollowgate_auth.users(id,email,display_name,status,email_verified_at,source) VALUES
   ($1,'global-owner@example.invalid','Owner','active',now(),'local'),
   ($2,'global-other@example.invalid','Other','active',now(),'local')`,[owner,other]);
 const campaignId=(await db.query(`INSERT INTO hollowgate_vtt.campaigns(owner_id,name,description,ruleset) VALUES($1,'QA','' ,'hsc') RETURNING id`,[owner])).rows[0].id;
 const id=(await db.query(`INSERT INTO hollowgate_vtt.catalog_entities(kind,owner_id,campaign_id,name,ruleset,data)
   VALUES('npcs',$1,$2,'Custode','hsc',$3::jsonb) RETURNING id`,[owner,campaignId,JSON.stringify({description:'Custodi'})])).rows[0].id;
 await db.exec('SET ROLE hollowgate_api_runtime;');
 const pool={query:(text,args)=>db.query(text,args)};
 return {db,service:createNativeGlobalEditorService({pool}),campaign:campaignId,entry:id};
}
test('native global editor lists owner-wide entries, edits media and notes on assigned entries',async()=>{
 const f=await fixture();
 try{
  const items=await f.service.list(owner,'npcs',null);
  assert.equal(items.length,1);
  assert.equal(items[0].ownerId,owner);
  assert.equal(items[0].campaignId,f.campaign);
  const entry=await f.service.mediaSave(owner,'npcs',f.entry,{revision:1,mimeType:'image/png',dataBase64:png},'portrait');
  assert.equal(entry.revision,2);
  const read=await f.service.mediaRead(owner,'npcs',f.entry,'portrait');
  assert.equal(read.mimeType,'image/png');
  assert.equal(read.revision,2);
  assert.ok(read.dataBase64);
  const listed=await f.service.notesList(owner,'npcs',f.entry);
  assert.deepEqual(listed.notes,[]);
  const {note}=await f.service.noteCreate(owner,'npcs',f.entry,{revision:2,name:'Nota testo'});
  assert.equal(note.tab_name,'Nota testo');
  const after=await f.service.notesList(owner,'npcs',f.entry);
  assert.equal(after.notes.length,1);
  // Other users see nothing and are denied.
  assert.deepEqual(await f.service.list(other,'npcs',null),[]);
  await assert.rejects(f.service.mediaRead(other,'npcs',f.entry,'portrait'),e=>e.status===404);
 }finally{await f.db.close();}
});
