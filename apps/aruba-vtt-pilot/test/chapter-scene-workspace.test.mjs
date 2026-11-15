import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaChapterSceneWorkspace} from '../src/ArubaChapterSceneWorkspace.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapterId='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const sceneId='c2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const secondId='d2244c0b-4b67-45c2-901a-2b4d3f7c8c42';
const timestamp='2026-01-02T03:04:05.000Z';
const chapter={id:chapterId,campaignId:campaign,title:'Intro',description:'',notes:'',
 kind:'standard',isActive:false,nextChapterIds:[],mapUrl:null,mapMetadata:{},
 locationMetadata:{},createdAt:timestamp,updatedAt:timestamp};
const scene=id=>({id,campaignId:campaign,chapterId,title:'Scena',description:'',notes:'',
 status:'draft',environmentId:null,imageUrl:null,sortOrder:id===sceneId?0:1,
 nextSceneIds:[],mapRegions:[],contextMetadata:{},sourceEnvironment:null,
 createdAt:timestamp,updatedAt:timestamp});
function mock({chapters=[chapter],scenes=[scene(sceneId)],failPut=false}={}){
 const calls=[];
 const fetchImpl=async(url,opts)=>{
  calls.push({url,opts});
  if(opts.method==='PUT'&&failPut)throw Error('Server unavailable');
  if(opts.method==='PUT'){
   const data=JSON.parse(opts.body);
   if(url.endsWith('/scenes')){scenes=scenes.map(s=>s.id===data.id?{...s,...data}:s);return response({scene:scenes.find(s=>s.id===data.id)});}
   chapters=chapters.map(ch=>ch.id===data.id?{...ch,...data}:ch);return response({chapter:chapters.find(ch=>ch.id===data.id)});
  }
  if(opts.method==='DELETE'){
   if(url.includes('/scenes/'))scenes=scenes.filter(s=>s.id!==url.split('/').at(-1));
   else chapters=chapters.filter(ch=>ch.id!==url.split('/').at(-1));
   return response({deleted:true});
  }
  return response(url.endsWith('/scenes')?{scenes}:{chapters});
 };
 return {fetchImpl,calls};
}
const response=data=>({ok:true,status:200,json:async()=>structuredClone(data)});
test('loads an isolated, ordered original Chapter and Scene graph',async()=>{
 const {fetchImpl}=mock({scenes:[scene(secondId),scene(sceneId)]});
 const workspace=createArubaChapterSceneWorkspace(fetchImpl,campaign);
 const state=await workspace.load();
 assert.deepEqual(state.scenesByChapter[chapterId].map(s=>s.id),[sceneId,secondId]);
 state.chapters[0].title='mutated';
 assert.equal(workspace.snapshot().chapters[0].title,'Intro');
});
test('rejects dangling Chapter and Scene references without rendering corrupt graph',async()=>{
 for(const data of [
  {chapters:[{...chapter,nextChapterIds:[secondId]}]},
  {scenes:[{...scene(sceneId),chapterId:secondId}]},
  {scenes:[{...scene(sceneId),nextSceneIds:[secondId]}]},
 ]){
  const {fetchImpl}=mock(data);
  await assert.rejects(()=>createArubaChapterSceneWorkspace(fetchImpl,campaign).load(),/Grafo/);
 }
});
test('blocks deleting linked or nonempty chapters without HTTP mutation',async()=>{
 const {fetchImpl,calls}=mock();
 const workspace=createArubaChapterSceneWorkspace(fetchImpl,campaign);
 await workspace.load();
 await assert.rejects(()=>workspace.removeChapter(chapterId),/contiene scene/);
 assert.equal(calls.filter(c=>c.opts.method==='DELETE').length,0);
});
test('reorders all chapter scenes and reloads authoritative state',async()=>{
 const {fetchImpl,calls}=mock({scenes:[scene(sceneId),scene(secondId)]});
 const workspace=createArubaChapterSceneWorkspace(fetchImpl,campaign);
 await workspace.load();
 await workspace.reorderScenes(chapterId,[secondId,sceneId]);
 assert.deepEqual(workspace.snapshot().scenesByChapter[chapterId].map(s=>s.id),[secondId,sceneId]);
 assert.equal(calls.filter(c=>c.opts.method==='PUT').length,2);
});
test('invalidates cached graph when a multi-document operation fails',async()=>{
 const {fetchImpl}=mock({scenes:[scene(sceneId),scene(secondId)],failPut:true});
 const workspace=createArubaChapterSceneWorkspace(fetchImpl,campaign);
 await workspace.load();
 await assert.rejects(()=>workspace.reorderScenes(chapterId,[secondId,sceneId]),/Server unavailable/);
 assert.throws(()=>workspace.snapshot(),/Carica prima/);
});
