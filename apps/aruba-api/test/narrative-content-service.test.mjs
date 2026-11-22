import test from 'node:test';
import assert from 'node:assert/strict';
import {createNarrativeContentService} from '../src/narrative-content-service.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001',campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',id='c2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
function mock(){
 const calls=[];return {calls,pool:{query:async(sql,args)=>{calls.push({sql,args});
  if(sql.includes('owner_authorized'))return {rows:[{allowed:true}]};
  if(sql.includes('list_owned'))return {rows:[{id,kind:'clues',campaign_id:campaign,payload:{title:'Sigillo',description:'',chapterId:null,sceneId:null}}]};
  if(sql.includes('save_owned'))return {rows:[{id}]};
  if(sql.includes('delete_owned'))return {rows:[{id}]};
  throw Error('Unexpected query');
 }}};
}
test('lists and saves owner-scoped narrative documents without trusting payload campaign',async()=>{
 const fixture=mock(),service=createNarrativeContentService({pool:fixture.pool});
 assert.deepEqual(await service.list(owner,campaign,'clues'),{items:[{id,campaignId:campaign,title:'Sigillo',description:'',chapterId:null,sceneId:null}]});
 const saved=await service.save(owner,campaign,'clues',{id,title:'Sigillo',description:'',chapterId:null,sceneId:null});
 assert.equal(saved.item.campaignId,campaign);assert.equal(fixture.calls.at(-1).args[2],'clues');
});
test('deletes only an exact kind and validates before database mutation',async()=>{
 const fixture=mock(),service=createNarrativeContentService({pool:fixture.pool});
 assert.deepEqual(await service.remove(owner,campaign,'events',id),{deleted:true});
 const count=fixture.calls.length;
 await assert.rejects(service.save(owner,campaign,'npcs',{id,name:'',chapterId:null}));
 assert.equal(fixture.calls.length,count);
 await assert.rejects(service.list(owner,campaign,'forged'));
});
