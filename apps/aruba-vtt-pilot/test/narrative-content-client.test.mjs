import test from 'node:test';
import assert from 'node:assert/strict';
import {listArubaNarrativeContent,saveArubaNarrativeContent} from '../src/client.mjs';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841',id='c2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const item={id,campaignId:campaign,title:'Sigillo',chapterId:null,sceneId:null};
test('narrative client uses cookie-only exact kind routes',async()=>{
 const calls=[],fetchImpl=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>options.method==='GET'?{items:[item]}:{item}};};
 assert.deepEqual(await listArubaNarrativeContent(fetchImpl,campaign,'clues'),[item]);
 await saveArubaNarrativeContent(fetchImpl,campaign,'clues',item);
 assert.equal(calls[0].url,`/vtt/campaigns/${campaign}/narrative/clues`);assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[1].options.method,'PUT');assert.equal(calls[1].options.credentials,'same-origin');
});
test('narrative client rejects invalid kinds, placement and forged responses',async()=>{
 let called=false,fetchImpl=async()=>{called=true;return {ok:true,status:200,json:async()=>({items:[]})};};
 await assert.rejects(listArubaNarrativeContent(fetchImpl,campaign,'forged'));assert.equal(called,false);
 await assert.rejects(saveArubaNarrativeContent(fetchImpl,campaign,'clues',{...item,chapterId:null,sceneId:id}));assert.equal(called,false);
 await assert.rejects(listArubaNarrativeContent(async()=>({ok:true,status:200,json:async()=>({items:[{...item,campaignId:id}]})}),campaign,'clues'));
});
test('narrative client accepts deterministic recovered entity placeholders',async()=>{
 const recovered={id,campaignId:campaign,title:'[Recupero] monster c2244c0b',reason:'Referenced by an exported entity note; source entity absent',chapterId:null,sceneId:null,environmentId:null,recoveredPlaceholder:true};
 const result=await listArubaNarrativeContent(async()=>({ok:true,status:200,json:async()=>({items:[recovered]})}),campaign,'monsters');
 assert.deepEqual(result,[recovered]);
});
