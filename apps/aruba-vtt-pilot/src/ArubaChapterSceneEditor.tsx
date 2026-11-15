import {useEffect,useMemo,useRef,useState} from 'react';
import {createArubaChapterSceneWorkspace} from './ArubaChapterSceneWorkspace.mjs';
import {normalizeChapterSpatialValue,normalizeSceneSpatialValue} from '../../../src/services/campaign/spatialDomainMigration';
import {generateUUID} from '../../../src/lib/uuid';
import type {Chapter} from '../../../src/types/chapter';
import type {Scene} from '../../../src/types/scene';
import {GitBranch,Plus,Save,Trash2,ArrowUp,ArrowDown,RefreshCcw} from 'lucide-react';

type Graph={chapters:Chapter[];scenes:Scene[];scenesByChapter:Record<string,Scene[]>};
type EditorProps={campaignId:string;enabled:boolean};
const freshChapter=(campaignId:string):Chapter=>normalizeChapterSpatialValue({
 id:generateUUID(),campaignId,title:'Nuovo capitolo',description:'',notes:'',
 kind:'standard',isActive:false,nextChapterIds:[],mapUrl:null,
 mapMetadata:{},locationMetadata:{},createdAt:new Date().toISOString(),
 updatedAt:new Date().toISOString(),
} as Chapter);
const freshScene=(campaignId:string,chapterId:string,sortOrder:number):Scene=>normalizeSceneSpatialValue({
 id:generateUUID(),campaignId,chapterId,title:'Nuova scena',description:'',notes:'',
 status:'draft',environmentId:null,imageUrl:null,sortOrder,nextSceneIds:[],
 mapRegions:[],contextMetadata:{timeOfDay:'',period:'',condition:''},
 createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
} as Scene);
const message=(error:unknown)=>error instanceof Error?error.message:'Operazione non riuscita';
export function ArubaChapterSceneEditor({campaignId,enabled}:EditorProps){
 const workspace=useMemo(()=>createArubaChapterSceneWorkspace(fetch.bind(window),campaignId),[campaignId]);
 const [graph,setGraph]=useState<Graph|null>(null);
 const [selectedChapterId,setSelectedChapterId]=useState<string|null>(null);
 const [selectedSceneId,setSelectedSceneId]=useState<string|null>(null);
 const [draftChapter,setDraftChapter]=useState<Chapter|null>(null);
 const [draftScene,setDraftScene]=useState<Scene|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const loaded=useRef(false);
 const dirty=Boolean((draftChapter&&graph?.chapters.some(c=>c.id===draftChapter.id&&JSON.stringify(c)!==JSON.stringify(draftChapter)))||
  (draftScene&&graph?.scenes.some(s=>s.id===draftScene.id&&JSON.stringify(s)!==JSON.stringify(draftScene))));
 const discard=()=>!dirty||window.confirm('Scartare le modifiche non salvate?');
 const selectChapter=(id:string|null,current:Graph|null=graph)=>{
  if(!discard())return;
  setSelectedChapterId(id);setSelectedSceneId(null);setDraftScene(null);
  setDraftChapter(current?.chapters.find(c=>c.id===id)??null);
 };
 const selectScene=(id:string|null,current:Graph|null=graph)=>{
  if(!discard())return;
  setSelectedSceneId(id);setDraftScene(current?.scenes.find(s=>s.id===id)??null);
 };
 useEffect(()=>{
  let live=true;
  loaded.current=false;setGraph(null);setError('');setBusy(true);
  if(!enabled){setBusy(false);return;}
  void workspace.load().then(next=>{
   if(!live)return;
   const state=next as Graph;loaded.current=true;setGraph(state);
   setSelectedChapterId(state.chapters[0]?.id??null);
   setDraftChapter(state.chapters[0]??null);setSelectedSceneId(null);setDraftScene(null);
  }).catch(e=>{if(live)setError(message(e));}).finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[workspace,enabled]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
  window.addEventListener('beforeunload',warn);
  return()=>window.removeEventListener('beforeunload',warn);
 },[dirty]);
 const chapters=graph?.chapters??[];
 const scenes=selectedChapterId?(graph?.scenesByChapter[selectedChapterId]??[]):[];
 async function perform(action:()=>Promise<unknown>,success:string,selection?:{chapter?:string|null;scene?:string|null}){
  setBusy(true);setError('');setNotice('');
  try{
   await action();
   const state=workspace.snapshot() as Graph;
   setGraph(state);
   const chapterId=selection&&'chapter'in selection?selection.chapter??null:selectedChapterId;
   const sceneId=selection&&'scene'in selection?selection.scene??null:selectedSceneId;
   setSelectedChapterId(chapterId);setDraftChapter(state.chapters.find(c=>c.id===chapterId)??null);
   setSelectedSceneId(sceneId);setDraftScene(state.scenes.find(s=>s.id===sceneId)??null);
   setNotice(success);
  }catch(e){setError(message(e));}
  finally{setBusy(false);}
 }
 if(!enabled)return <p role="status">Il servizio Capitoli e Scene non è ancora attivo su questo ambiente Aruba.</p>;
 return <section className="aruba-chapter-scene-editor" aria-label="Capitoli e Scene">
  <header className="section-title"><div><div className="overline">GAME MASTER · CAMPAGNA</div><h1>Capitoli e Scene</h1>
   <p className="muted">Struttura narrativa e scene della campagna, salvate su Aruba.</p></div>
   <button type="button" disabled={busy} onClick={()=>{if(!discard())return;setBusy(true);setError('');void workspace.load().then(next=>{const state=next as Graph;setGraph(state);setSelectedChapterId(state.chapters[0]?.id??null);setDraftChapter(state.chapters[0]??null);setSelectedSceneId(null);setDraftScene(null);}).catch(e=>setError(message(e))).finally(()=>setBusy(false));}}><RefreshCcw size={16}/> Aggiorna</button></header>
  {error&&<p role="alert" className="error">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  {busy&&!graph&&<p>Caricamento Capitoli e Scene…</p>}
  {graph&&<div className="aruba-chapter-scene-grid">
   <aside className="aruba-chapter-scene-list"><h2>Capitoli</h2>
    {chapters.map(ch=><button key={ch.id} type="button" aria-pressed={selectedChapterId===ch.id} className={selectedChapterId===ch.id?'selected':''} onClick={()=>selectChapter(ch.id)}><GitBranch size={16}/>{ch.title}</button>)}
    <button type="button" disabled={busy} onClick={()=>{if(!discard())return;const draft=freshChapter(campaignId);void perform(()=>workspace.saveChapter(draft),'Capitolo creato',{chapter:draft.id,scene:null});}}><Plus size={16}/> Nuovo capitolo</button>
   </aside>
   <div className="aruba-chapter-scene-detail">
    {draftChapter&&<section aria-label="Dettagli capitolo"><h2>Capitolo</h2>
     <label>Titolo<input maxLength={200} value={draftChapter.title} onChange={e=>setDraftChapter({...draftChapter,title:e.target.value})}/></label>
     <label>Tipologia<select value={draftChapter.kind} onChange={e=>setDraftChapter({...draftChapter,kind:e.target.value as Chapter['kind']})}><option value="intro">Introduzione</option><option value="standard">Standard</option><option value="final">Finale</option></select></label>
     <label>Descrizione<textarea maxLength={10000} value={draftChapter.description} onChange={e=>setDraftChapter({...draftChapter,description:e.target.value})}/></label>
     <label>Note<textarea maxLength={50000} value={draftChapter.notes} onChange={e=>setDraftChapter({...draftChapter,notes:e.target.value})}/></label>
     <label><input type="checkbox" checked={draftChapter.isActive} onChange={e=>setDraftChapter({...draftChapter,isActive:e.target.checked})}/> Capitolo attivo</label>
     <fieldset><legend>Collegamenti ai capitoli successivi</legend>{chapters.filter(ch=>ch.id!==draftChapter.id).map(ch=><label key={ch.id}><input type="checkbox" checked={draftChapter.nextChapterIds.includes(ch.id)} onChange={e=>setDraftChapter({...draftChapter,nextChapterIds:e.target.checked?[...draftChapter.nextChapterIds,ch.id]:draftChapter.nextChapterIds.filter(id=>id!==ch.id)})}/>{ch.title}</label>)}</fieldset>
     <div className="modal-actions"><button type="button" disabled={busy||!draftChapter.title.trim()} onClick={()=>void perform(()=>workspace.saveChapter({...draftChapter,updatedAt:new Date().toISOString()}),'Capitolo salvato')}><Save size={16}/> Salva capitolo</button>
      <button type="button" disabled={busy} onClick={()=>{if(window.confirm('Eliminare il capitolo? Le scene devono essere eliminate prima.'))void perform(()=>workspace.removeChapter(draftChapter.id),'Capitolo eliminato',{chapter:null,scene:null});}}><Trash2 size={16}/> Elimina</button></div>
    </section>}
    {selectedChapterId&&<section aria-label="Scene del capitolo"><h2>Scene del capitolo</h2>
     <div className="aruba-chapter-scene-list">{scenes.map(scene=><button key={scene.id} type="button" aria-pressed={selectedSceneId===scene.id} className={selectedSceneId===scene.id?'selected':''} onClick={()=>selectScene(scene.id)}>{scene.title} · {scene.status}</button>)}</div>
     <button type="button" disabled={busy} onClick={()=>{if(!discard())return;const draft=freshScene(campaignId,selectedChapterId,scenes.length);void perform(()=>workspace.saveScene(draft),'Scena creata',{scene:draft.id});}}><Plus size={16}/> Nuova scena</button>
     {draftScene&&<div className="aruba-chapter-scene-detail"><h3>Dettagli scena</h3>
      <label>Titolo<input maxLength={200} value={draftScene.title} onChange={e=>setDraftScene({...draftScene,title:e.target.value})}/></label>
      <label>Stato<select value={draftScene.status} onChange={e=>setDraftScene({...draftScene,status:e.target.value as Scene['status']})}><option value="draft">Preparazione</option><option value="ready">Pronta</option><option value="completed">Conclusa</option></select></label>
      <label>Descrizione<textarea maxLength={10000} value={draftScene.description} onChange={e=>setDraftScene({...draftScene,description:e.target.value})}/></label>
      <label>Note<textarea maxLength={50000} value={draftScene.notes} onChange={e=>setDraftScene({...draftScene,notes:e.target.value})}/></label>
      <fieldset><legend>Scene successive</legend>{(graph?.scenes??[]).filter(s=>s.id!==draftScene.id).map(s=><label key={s.id}><input type="checkbox" checked={draftScene.nextSceneIds.includes(s.id)} onChange={e=>setDraftScene({...draftScene,nextSceneIds:e.target.checked?[...draftScene.nextSceneIds,s.id]:draftScene.nextSceneIds.filter(id=>id!==s.id)})}/>{s.title}</label>)}</fieldset>
      <div className="modal-actions"><button type="button" disabled={busy||!draftScene.title.trim()} onClick={()=>void perform(()=>workspace.saveScene({...draftScene,updatedAt:new Date().toISOString()}),'Scena salvata')}><Save size={16}/> Salva scena</button>
       <button type="button" disabled={busy||scenes[0]?.id===draftScene.id} onClick={()=>void perform(()=>workspace.reorderScenes(selectedChapterId,(()=>{const ids=scenes.map(s=>s.id);const i=ids.indexOf(draftScene.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];return ids;})()),'Ordine aggiornato')}><ArrowUp size={16}/> Indietro</button>
       <button type="button" disabled={busy||scenes.at(-1)?.id===draftScene.id} onClick={()=>void perform(()=>workspace.reorderScenes(selectedChapterId,(()=>{const ids=scenes.map(s=>s.id);const i=ids.indexOf(draftScene.id);[ids[i+1],ids[i]]=[ids[i],ids[i+1]];return ids;})()),'Ordine aggiornato')}><ArrowDown size={16}/> Avanti</button>
       <button type="button" disabled={busy} onClick={()=>{if(window.confirm('Eliminare la scena?'))void perform(()=>workspace.removeScene(draftScene.id),'Scena eliminata',{scene:null});}}><Trash2 size={16}/> Elimina scena</button></div>
     </div>}
    </section>}
   </div>
  </div>}
 </section>;
}
