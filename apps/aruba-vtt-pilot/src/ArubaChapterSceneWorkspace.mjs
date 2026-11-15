// Cohesive Aruba domain boundary for the original GM ChapterManager and
// ChapterScenesEditor. This module does not render replacement UI or use Supabase.
// The original components must be wired only after all content dependencies migrate.
import {
 listArubaChapters,listArubaScenes,saveArubaChapter,saveArubaScene,
 deleteArubaChapter,deleteArubaScene,
} from './client.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byOrder=(a,b)=>a.sortOrder-b.sortOrder||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id);
const copy=value=>structuredClone(value);
function assertGraph(chapters,scenes,campaignId){
 if(!uuid.test(campaignId))throw Error('Campagna non valida');
 const chaptersById=new Map(chapters.map(ch=>[ch.id,ch]));
 const scenesById=new Map(scenes.map(scene=>[scene.id,scene]));
 if(chaptersById.size!==chapters.length||scenesById.size!==scenes.length)
  throw Error('Identificativi duplicati');
 for(const chapter of chapters){
  if(chapter.campaignId!==campaignId||
   chapter.nextChapterIds.some(id=>!chaptersById.has(id)))
   throw Error('Grafo capitoli incompleto');
 }
 for(const scene of scenes){
  if(scene.campaignId!==campaignId||!chaptersById.has(scene.chapterId)||
   scene.nextSceneIds.some(id=>!scenesById.has(id)))
   throw Error('Grafo scene incompleto');
 }
 return {chaptersById,scenesById};
}
export function createArubaChapterSceneWorkspace(fetchImpl,campaignId){
 if(typeof fetchImpl!=='function'||!uuid.test(campaignId))
  throw Error('Workspace non valido');
 let state=null;
 let busy=false;
 function requireState(){
  if(!state)throw Error('Carica prima Capitoli e Scene');
  return state;
 }
 async function mutate(operation){
  if(busy)throw Error('Operazione già in corso');
  requireState();busy=true;
  try{
   const result=await operation();
   // Always reread authoritative state after a write; never invent a local
   // successful state after a partial server transaction.
   state=null;
   await refreshInternal();
   return result;
  }catch(error){state=null;throw error;}
  finally{busy=false;}
 }
 async function refreshInternal(){
  const [chapters,scenes]=await Promise.all([
   listArubaChapters(fetchImpl,campaignId),listArubaScenes(fetchImpl,campaignId),
  ]);
  assertGraph(chapters,scenes,campaignId);
  state={chapters:copy(chapters),scenes:copy(scenes)};
  return snapshot();
 }
 function snapshot(){
  const current=requireState();
  return copy({
   chapters:current.chapters,
   scenes:current.scenes,
   scenesByChapter:Object.fromEntries(current.chapters.map(ch=>[
    ch.id,current.scenes.filter(scene=>scene.chapterId===ch.id).sort(byOrder),
   ])),
  });
 }
 return Object.freeze({
  async load(){
   if(busy)throw Error('Operazione già in corso');
   state=null;return refreshInternal();
  },
  snapshot,
  async saveChapter(draft){
   return mutate(async()=>{
    if(draft?.campaignId!==undefined&&draft.campaignId!==campaignId)
     throw Error('Campagna capitolo non valida');
    if(draft?.nextChapterIds?.some(id=>id!==draft.id&&!requireState().chapters.some(ch=>ch.id===id)))
     throw Error('Collegamento capitolo inesistente');
    return saveArubaChapter(fetchImpl,campaignId,draft);
   });
  },
  async saveScene(draft){
   return mutate(async()=>{
    const current=requireState();
    if(!current.chapters.some(ch=>ch.id===draft?.chapterId))
     throw Error('Capitolo scena inesistente');
    if(draft.nextSceneIds?.some(id=>id!==draft.id&&!current.scenes.some(scene=>scene.id===id)))
     throw Error('Collegamento scena inesistente');
    return saveArubaScene(fetchImpl,campaignId,draft);
   });
  },
  async removeScene(sceneId){
   return mutate(async()=>{
    const current=requireState();
    if(!current.scenes.some(scene=>scene.id===sceneId))
     throw Error('Scena inesistente');
    if(current.scenes.some(scene=>scene.nextSceneIds.includes(sceneId)))
     throw Error('Rimuovi prima i collegamenti alla scena');
    return deleteArubaScene(fetchImpl,campaignId,sceneId);
   });
  },
  async removeChapter(chapterId){
   return mutate(async()=>{
    const current=requireState();
    if(!current.chapters.some(ch=>ch.id===chapterId))
     throw Error('Capitolo inesistente');
    if(current.chapters.some(ch=>ch.nextChapterIds.includes(chapterId)))
     throw Error('Rimuovi prima i collegamenti al capitolo');
    if(current.scenes.some(scene=>scene.chapterId===chapterId))
     throw Error('Il capitolo contiene scene: spostale o eliminale prima');
    return deleteArubaChapter(fetchImpl,campaignId,chapterId);
   });
  },
  async reorderScenes(chapterId,orderedIds){
   return mutate(async()=>{
    const current=requireState();
    if(!current.chapters.some(ch=>ch.id===chapterId))
     throw Error('Capitolo inesistente');
    const existing=current.scenes.filter(scene=>scene.chapterId===chapterId).sort(byOrder);
    if(!Array.isArray(orderedIds)||orderedIds.length!==existing.length||
     new Set(orderedIds).size!==orderedIds.length||
     orderedIds.some(id=>!existing.some(scene=>scene.id===id)))
     throw Error('Ordine scene non valido');
    // The API has per-document writes, not a transactional batch endpoint.
    // On partial failure invalidate state and require a fresh read.
    const byId=new Map(existing.map(scene=>[scene.id,scene]));
    for(let index=0;index<orderedIds.length;index++){
     const scene=byId.get(orderedIds[index]);
     if(scene.sortOrder!==index)
      await saveArubaScene(fetchImpl,campaignId,{...scene,sortOrder:index});
    }
    return true;
   });
  },
 });
}
