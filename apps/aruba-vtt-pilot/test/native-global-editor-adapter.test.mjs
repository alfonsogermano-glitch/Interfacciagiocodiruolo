// Native global editor transport: owner-wide listing, media and notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNativeGlobalEntries,saveNativeGlobalMedia,readNativeGlobalMedia,
  listNativeGlobalNotes,createNativeGlobalNote} from '../src/ArubaCatalogService.ts';
const actor='22000000-0000-4000-8000-000000000001';
const id='22000000-0000-4000-8000-000000000003';
globalThis.__HG_ARUBA_TOPBAR_IDENTITY__={id:actor};
const item={kind:'npcs',id,ownerId:actor,campaignId:null,name:'Custode',revision:1,status:'active',data:{}};
const original=globalThis.fetch;
test('loadNativeGlobalEntries returns validated global entries',async()=>{
 const seen=[];
 globalThis.fetch=async(url)=>{seen.push(String(url));return {ok:true,json:async()=>[item]};};
 try{
  const entries=await loadNativeGlobalEntries('npcs');
  assert.equal(entries.length,1);
  assert.equal(entries[0].id,id);
  assert.equal(seen[0],'/vtt/catalog/native/global/npcs');
 }finally{globalThis.fetch=original;}
});
test('global media and notes use the global transport paths',async()=>{
 const seen=[];
 globalThis.fetch=async(url,init)=>{seen.push(String(url)+':'+(init?.method||'GET'));
  return {ok:true,json:async()=>item};};
 try{
  await saveNativeGlobalMedia('npcs',id,1,'portrait','image/png','AAA=');
  await readNativeGlobalMedia('npcs',id,'portrait');
  await listNativeGlobalNotes('npcs',id);
  await createNativeGlobalNote('npcs',id,2,'Nota testo');
  assert.deepEqual(seen,[
   '/vtt/catalog/native/global/npcs/'+id+'/media/portrait:PUT',
   '/vtt/catalog/native/global/npcs/'+id+'/media/portrait:GET',
   '/vtt/catalog/native/global/npcs/'+id+'/notes:GET',
   '/vtt/catalog/native/global/npcs/'+id+'/notes:POST',
  ]);
 }finally{globalThis.fetch=original;}
});
test('global editor rejects invalid identifiers and malformed pages',async()=>{
 globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'bad'}]});
 try{
  await assert.rejects(loadNativeGlobalEntries('npcs'),/Elemento catalogo globale non valido/);
  await assert.rejects(saveNativeGlobalMedia('npcs','bad',1,'portrait','image/png','AAA='),/IDENTITA_MEDIA_INVALIDA/);
 }finally{globalThis.fetch=original;}
});
