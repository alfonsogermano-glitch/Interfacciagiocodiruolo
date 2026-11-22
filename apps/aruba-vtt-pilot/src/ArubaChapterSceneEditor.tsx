import {useEffect,useMemo,useRef,useState} from 'react';
import {createArubaChapterSceneWorkspace} from './ArubaChapterSceneWorkspace.mjs';
import {ArubaNarrativeScopeContent} from './ArubaNarrativeScopeContent';
import {normalizeChapterSpatialValue,normalizeSceneSpatialValue} from '../../../src/services/campaign/spatialDomainMigration';
import {generateUUID} from '../../../src/lib/uuid';
import type {Chapter} from '../../../src/types/chapter';
import type {Scene} from '../../../src/types/scene';
import type {SceneMapRegion,MapRect} from '../../../src/types/mapGeometry';
import {GitBranch,Plus,Save,Trash2,ArrowUp,ArrowDown,RefreshCcw,LayoutDashboard,Map as MapIcon,Boxes,Clapperboard,Waypoints,FileText,Edit2,X} from 'lucide-react';

type Graph={chapters:Chapter[];scenes:Scene[];scenesByChapter:Record<string,Scene[]>};
type EditorProps={campaignId:string;enabled:boolean;contentEnabled:boolean};
type ChapterPanel='overview'|'map'|'content'|'scenes'|'flow';
type ScenePanel='details'|'map'|'content'|'flow';
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
const validMediaUrl=(url:string)=>!url||(/^https:\/\/[^\s]+$/i.test(url)&&!/supabase(?:\.co|\.in)/i.test(url));
const percent=(value:number)=>Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
const addMapRegion=(scene:Scene):Scene=>({
 ...scene,mapRegions:[...scene.mapRegions,{
  id:generateUUID(),label:'Area '+(scene.mapRegions.length+1),
  color:'#d7a65b',geometry:{kind:'rect',rect:{x:10,y:10,width:20,height:20}},
 }],
});
const updateRegion=(scene:Scene,id:string,patch:Partial<MapRect>):Scene=>({
 ...scene,mapRegions:scene.mapRegions.map(region=>region.id===id&&region.geometry.kind==='rect'?
 {...region,geometry:{kind:'rect',rect:{...region.geometry.rect,...patch}}}:region),
});
function MapOverview({chapter,scenes,selectedId}:{chapter:Chapter;scenes:Scene[];selectedId:string|null}){
 const grid=chapter.mapMetadata;
 const backgroundSize=`${100/grid.gridColumns}% ${100/grid.gridRows}%`;
 return <div className="aruba-scene-map-overview" style={grid.gridVisible?{
  backgroundImage:'linear-gradient(to right, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--dash-text) 15%, transparent) 1px, transparent 1px)',
  backgroundSize,
 }:undefined}>
  {chapter.mapUrl&&validMediaUrl(chapter.mapUrl)?<img src={chapter.mapMetadata.previewUrl??chapter.mapUrl} alt={`Mappa di ${chapter.title}`}/>:<div className="aruba-scene-map-empty">Aggiungi l’immagine della mappa nel Capitolo per disegnare le aree significative.</div>}
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Aree delle scene sulla mappa">
   {scenes.flatMap(scene=>scene.mapRegions.map(region=>region.geometry.kind==='rect'?
    <rect key={`${scene.id}:${region.id}`} x={region.geometry.rect.x} y={region.geometry.rect.y} width={region.geometry.rect.width} height={region.geometry.rect.height} fill={region.color} fillOpacity={scene.id===selectedId?0.3:0.12} stroke={region.color} strokeWidth={scene.id===selectedId?0.8:0.4} vectorEffect="non-scaling-stroke"/>:
    <polygon key={`${scene.id}:${region.id}`} points={region.geometry.points.map(point=>`${point.x},${point.y}`).join(' ')} fill={region.color} fillOpacity={scene.id===selectedId?0.3:0.12} stroke={region.color} strokeWidth={scene.id===selectedId?0.8:0.4} vectorEffect="non-scaling-stroke"/>))}
  </svg>
 </div>;
}
const message=(error:unknown)=>error instanceof Error?error.message:'Operazione non riuscita';
export function ArubaChapterSceneEditor({campaignId,enabled,contentEnabled}:EditorProps){
 const workspace=useMemo(()=>createArubaChapterSceneWorkspace(fetch.bind(window),campaignId),[campaignId]);
 const [graph,setGraph]=useState<Graph|null>(null);
 const [selectedChapterId,setSelectedChapterId]=useState<string|null>(null);
 const [selectedSceneId,setSelectedSceneId]=useState<string|null>(null);
 const [draftChapter,setDraftChapter]=useState<Chapter|null>(null);
 const [draftScene,setDraftScene]=useState<Scene|null>(null);
 const [chapterPanel,setChapterPanel]=useState<ChapterPanel>('overview');
 const [scenePanel,setScenePanel]=useState<ScenePanel>('details');
 const [chapterEditing,setChapterEditing]=useState(false);
 const [sceneEditing,setSceneEditing]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const loaded=useRef(false);
 const chapterDirty=Boolean(draftChapter&&graph?.chapters.some(c=>c.id===draftChapter.id&&JSON.stringify(c)!==JSON.stringify(draftChapter)));
 const sceneDirty=Boolean(draftScene&&graph?.scenes.some(s=>s.id===draftScene.id&&JSON.stringify(s)!==JSON.stringify(draftScene)));
 const dirty=chapterDirty||sceneDirty;
 const discard=()=>!dirty||window.confirm('Scartare le modifiche non salvate?');
 const selectChapter=(id:string|null,current:Graph|null=graph)=>{
  if(!discard())return;
  setSelectedChapterId(id);setSelectedSceneId(null);setDraftScene(null);
  setChapterPanel('overview');setScenePanel('details');setChapterEditing(false);setSceneEditing(false);
  setDraftChapter(current?.chapters.find(c=>c.id===id)??null);
 };
 const selectScene=(id:string|null,current:Graph|null=graph)=>{
  if(!discard())return;
  setSelectedSceneId(id);setDraftScene(current?.scenes.find(s=>s.id===id)??null);setScenePanel('details');setSceneEditing(false);
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
    return true;
   }catch(e){setError(message(e));return false;}
   finally{setBusy(false);}
 }
 const cancelChapterEditing=()=>{
  if(chapterDirty&&!window.confirm('Scartare le modifiche non salvate al Capitolo?'))return;
  setDraftChapter(graph?.chapters.find(chapter=>chapter.id===selectedChapterId)??null);setChapterEditing(false);
 };
 const cancelSceneEditing=()=>{
  if(sceneDirty&&!window.confirm('Scartare le modifiche non salvate alla Scena?'))return;
  setDraftScene(graph?.scenes.find(scene=>scene.id===selectedSceneId)??null);setSceneEditing(false);
 };
 const changeChapterPanel=(panel:ChapterPanel)=>{
  if(panel===chapterPanel)return;
  if(chapterEditing&&chapterDirty&&!window.confirm('Scartare le modifiche non salvate al Capitolo?'))return;
  if(chapterEditing)setDraftChapter(graph?.chapters.find(chapter=>chapter.id===selectedChapterId)??null);
  setChapterEditing(false);setChapterPanel(panel);
 };
 const changeScenePanel=(panel:ScenePanel)=>{
  if(panel===scenePanel)return;
  if(sceneEditing&&sceneDirty&&!window.confirm('Scartare le modifiche non salvate alla Scena?'))return;
  if(sceneEditing)setDraftScene(graph?.scenes.find(scene=>scene.id===selectedSceneId)??null);
  setSceneEditing(false);setScenePanel(panel);
 };
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
     {draftChapter&&<section aria-label="Dettagli capitolo"><div className="aruba-editor-heading"><div><h2>{draftChapter.title}</h2><span className="muted">{chapterEditing?'Modifica Capitolo in corso':draftChapter.kind==='intro'?'Introduzione':draftChapter.kind==='final'?'Finale':'Standard'}</span></div><div className="aruba-editor-heading-actions">{chapterEditing?<><button type="button" aria-label="Salva modifiche Capitolo" title="Salva modifiche" disabled={busy||!chapterDirty||!draftChapter.title.trim()||!validMediaUrl(draftChapter.mapUrl??'')} onClick={()=>void perform(()=>workspace.saveChapter({...draftChapter,updatedAt:new Date().toISOString()}),'Capitolo salvato').then(saved=>{if(saved)setChapterEditing(false);})}><Save size={16}/></button><button type="button" aria-label="Annulla modifiche Capitolo" title="Annulla modifiche" disabled={busy} onClick={cancelChapterEditing}><X size={16}/></button></>:<button type="button" aria-label="Modifica Capitolo" title="Modifica Capitolo" disabled={busy} onClick={()=>setChapterEditing(true)}><Edit2 size={16}/></button>}<button type="button" aria-label="Elimina Capitolo" title="Elimina Capitolo" disabled={busy||chapterEditing} onClick={()=>{if(window.confirm('Eliminare il capitolo? Le scene devono essere eliminate prima.'))void perform(()=>workspace.removeChapter(draftChapter.id),'Capitolo eliminato',{chapter:null,scene:null});}}><Trash2 size={16}/></button></div></div>
      <div className="aruba-editor-tabs" role="tablist" aria-label="Sezioni capitolo">{([
       ['overview','Panoramica',LayoutDashboard,false],['map','Mappa',MapIcon,false],['content','Contenuti',Boxes,!contentEnabled],['scenes','Scene',Clapperboard,false],['flow','Diramazioni',Waypoints,false],
       ] as const).map(([id,label,Icon,disabled])=><button key={id} type="button" role="tab" aria-selected={chapterPanel===id} disabled={disabled} title={disabled?'In attesa del servizio Contenuti Aruba':label} className={chapterPanel===id?'selected':''} onClick={()=>changeChapterPanel(id)}><Icon size={15}/>{label}</button>)}</div>
      <fieldset disabled={!chapterEditing} className={chapterPanel==='overview'?'aruba-editor-panel aruba-editor-fields':'hidden'}>
       <label>Titolo<input maxLength={200} value={draftChapter.title} onChange={e=>setDraftChapter({...draftChapter,title:e.target.value})}/></label>
       <label>Tipologia<select value={draftChapter.kind} onChange={e=>setDraftChapter({...draftChapter,kind:e.target.value as Chapter['kind']})}><option value="intro">Introduzione</option><option value="standard">Standard</option><option value="final">Finale</option></select></label>
       <label>Descrizione<textarea maxLength={10000} value={draftChapter.description} onChange={e=>setDraftChapter({...draftChapter,description:e.target.value})}/></label>
       <label>Note GM<textarea maxLength={50000} value={draftChapter.notes} onChange={e=>setDraftChapter({...draftChapter,notes:e.target.value})}/></label>
       <label><input type="checkbox" checked={draftChapter.isActive} onChange={e=>setDraftChapter({...draftChapter,isActive:e.target.checked})}/> Capitolo attivo</label>
      </fieldset>
      <fieldset disabled={!chapterEditing} className={chapterPanel==='map'?'':'hidden'}><legend>Mappa generale del capitolo</legend>
      <label>URL immagine mappa (HTTPS Aruba o risorsa esterna)<input type="url" maxLength={2048} value={draftChapter.mapUrl??''} onChange={e=>setDraftChapter({...draftChapter,mapUrl:e.target.value||null,mapMetadata:{...draftChapter.mapMetadata,imageUrl:e.target.value||null}})}/></label>
      <label><input type="checkbox" checked={draftChapter.mapMetadata.gridVisible} onChange={e=>setDraftChapter({...draftChapter,mapMetadata:{...draftChapter.mapMetadata,gridVisible:e.target.checked}})}/> Griglia visibile</label>
      <label>Colonne griglia<input type="number" min={1} max={200} value={draftChapter.mapMetadata.gridColumns} onChange={e=>setDraftChapter({...draftChapter,mapMetadata:{...draftChapter.mapMetadata,gridColumns:Math.max(1,Math.min(200,Number(e.target.value)||1))}})}/></label>
      <label>Righe griglia<input type="number" min={1} max={200} value={draftChapter.mapMetadata.gridRows} onChange={e=>setDraftChapter({...draftChapter,mapMetadata:{...draftChapter.mapMetadata,gridRows:Math.max(1,Math.min(200,Number(e.target.value)||1))}})}/></label>
      {draftChapter.mapUrl&&validMediaUrl(draftChapter.mapUrl)&&<img alt="Anteprima mappa capitolo" src={draftChapter.mapUrl} style={{maxWidth:'100%',maxHeight:320,objectFit:'contain'}}/>}
     </fieldset>
       <fieldset disabled={!chapterEditing} className={chapterPanel==='flow'?'':'hidden'}><legend>Possibili capitoli successivi</legend>{chapters.filter(ch=>ch.id!==draftChapter.id).map(ch=><label key={ch.id}><input type="checkbox" checked={draftChapter.nextChapterIds.includes(ch.id)} onChange={e=>setDraftChapter({...draftChapter,nextChapterIds:e.target.checked?[...draftChapter.nextChapterIds,ch.id]:draftChapter.nextChapterIds.filter(id=>id!==ch.id)})}/>{ch.title}</label>)}</fieldset>
      <div className={chapterPanel==='content'?'':'hidden'}>{contentEnabled&&<ArubaNarrativeScopeContent campaignId={campaignId} chapterId={draftChapter.id}/>}</div>
     <div className={chapterPanel==='scenes'?'':'hidden'}>
     {selectedChapterId&&<section aria-label="Scene del capitolo"><h2>Scene del capitolo</h2>
     <div className="aruba-chapter-scene-list">{scenes.map(scene=><button key={scene.id} type="button" aria-pressed={selectedSceneId===scene.id} className={selectedSceneId===scene.id?'selected':''} onClick={()=>selectScene(scene.id)}>{scene.title} · {scene.status}</button>)}</div>
      <button type="button" disabled={busy} onClick={()=>{if(!discard())return;const draft=freshScene(campaignId,selectedChapterId,scenes.length);void perform(()=>workspace.saveScene(draft),'Scena creata',{scene:draft.id});}}><Plus size={16}/> Nuova scena</button>
       {draftScene&&<div className="aruba-chapter-scene-detail"><div className="aruba-editor-heading"><div><h3>{draftScene.title}</h3><span className="muted">{sceneEditing?'Modifica Scena in corso':draftScene.status==='ready'?'Pronta':draftScene.status==='completed'?'Conclusa':'Preparazione'}</span></div><div className="aruba-editor-heading-actions">{sceneEditing?<><button type="button" aria-label="Salva modifiche Scena" title="Salva modifiche" disabled={busy||!sceneDirty||!draftScene.title.trim()} onClick={()=>void perform(()=>workspace.saveScene({...draftScene,updatedAt:new Date().toISOString()}),'Scena salvata').then(saved=>{if(saved)setSceneEditing(false);})}><Save size={16}/></button><button type="button" aria-label="Annulla modifiche Scena" title="Annulla modifiche" disabled={busy} onClick={cancelSceneEditing}><X size={16}/></button></>:<button type="button" aria-label="Modifica Scena" title="Modifica Scena" disabled={busy} onClick={()=>setSceneEditing(true)}><Edit2 size={16}/></button>}<button type="button" aria-label="Elimina Scena" title="Elimina Scena" disabled={busy||sceneEditing} onClick={()=>{if(window.confirm('Eliminare la scena?'))void perform(()=>workspace.removeScene(draftScene.id),'Scena eliminata',{scene:null});}}><Trash2 size={16}/></button></div></div>
       <div className="aruba-editor-tabs aruba-scene-tabs" role="tablist" aria-label="Sezioni scena">{([
        ['details','Dettagli',FileText,false],['map','Mappa',MapIcon,false],['content','Contenuti',Boxes,!contentEnabled],['flow','Diramazioni',Waypoints,false],
        ] as const).map(([id,label,Icon,disabled])=><button key={id} type="button" role="tab" aria-selected={scenePanel===id} disabled={disabled} title={disabled?'In attesa del servizio Contenuti Aruba':label} className={scenePanel===id?'selected':''} onClick={()=>changeScenePanel(id)}><Icon size={14}/>{label}</button>)}</div>
       <fieldset disabled={!sceneEditing} className={scenePanel==='details'?'aruba-editor-panel aruba-editor-fields':'hidden'}>
        <label>Titolo<input maxLength={200} value={draftScene.title} onChange={e=>setDraftScene({...draftScene,title:e.target.value})}/></label>
        <label>Stato<select value={draftScene.status} onChange={e=>setDraftScene({...draftScene,status:e.target.value as Scene['status']})}><option value="draft">Preparazione</option><option value="ready">Pronta</option><option value="completed">Conclusa</option></select></label>
        <label>Descrizione per i giocatori<textarea maxLength={10000} value={draftScene.description} onChange={e=>setDraftScene({...draftScene,description:e.target.value})}/></label>
        <label>Note GM<textarea maxLength={50000} value={draftScene.notes} onChange={e=>setDraftScene({...draftScene,notes:e.target.value})}/></label>
       <fieldset><legend>Contesto scena</legend>
       <label>Momento della giornata<input maxLength={100} value={draftScene.contextMetadata.timeOfDay} onChange={e=>setDraftScene({...draftScene,contextMetadata:{...draftScene.contextMetadata,timeOfDay:e.target.value}})}/></label>
       <label>Periodo<input maxLength={100} value={draftScene.contextMetadata.period} onChange={e=>setDraftScene({...draftScene,contextMetadata:{...draftScene.contextMetadata,period:e.target.value}})}/></label>
       <label>Condizioni<input maxLength={100} value={draftScene.contextMetadata.condition} onChange={e=>setDraftScene({...draftScene,contextMetadata:{...draftScene.contextMetadata,condition:e.target.value}})}/></label>
       </fieldset>
        </fieldset>
      <fieldset disabled={!sceneEditing} className={scenePanel==='map'?'aruba-scene-map-fieldset':'hidden'}><legend>Regioni della mappa</legend>
       {draftChapter&&<MapOverview chapter={draftChapter} scenes={scenes} selectedId={draftScene.id}/>}
       {draftScene.mapRegions.map((region:SceneMapRegion)=><div key={region.id} className="aruba-map-region">
        <label>Nome area<input maxLength={100} value={region.label} onChange={e=>setDraftScene({...draftScene,mapRegions:draftScene.mapRegions.map(r=>r.id===region.id?{...r,label:e.target.value}:r)})}/></label>
        <label>Colore<input type="color" value={region.color} onChange={e=>setDraftScene({...draftScene,mapRegions:draftScene.mapRegions.map(r=>r.id===region.id?{...r,color:e.target.value}:r)})}/></label>
        {region.geometry.kind==='rect'&&(['x','y','width','height'] as const).map(key=><label key={key}>{key.toUpperCase()} (%)
         <input type="number" min={0} max={100} value={region.geometry.kind==='rect'?region.geometry.rect[key]:0} onChange={e=>setDraftScene(updateRegion(draftScene,region.id,{[key]:percent(Number(e.target.value))}))}/></label>)}
        <button type="button" onClick={()=>setDraftScene({...draftScene,mapRegions:draftScene.mapRegions.filter(r=>r.id!==region.id)})}>Rimuovi area</button>
       </div>)}
       <button type="button" disabled={draftScene.mapRegions.length>=1000} onClick={()=>setDraftScene(addMapRegion(draftScene))}><Plus size={16}/> Aggiungi area</button>
      </fieldset>
      <div className={scenePanel==='content'?'':'hidden'}>{contentEnabled&&<ArubaNarrativeScopeContent campaignId={campaignId} chapterId={draftScene.chapterId} sceneId={draftScene.id}/>}</div>
      <fieldset disabled={!sceneEditing} className={scenePanel==='flow'?'':'hidden'}><legend>Scene successive possibili</legend>{scenes.filter(s=>s.id!==draftScene.id).map(s=><label key={s.id}><input type="checkbox" checked={draftScene.nextSceneIds.includes(s.id)} onChange={e=>setDraftScene({...draftScene,nextSceneIds:e.target.checked?[...draftScene.nextSceneIds,s.id]:draftScene.nextSceneIds.filter(id=>id!==s.id)})}/>{s.title}</label>)}{scenes.length<=1&&<p className="muted">Crea almeno un’altra scena per aggiungere una diramazione.</p>}</fieldset>
      <div className="modal-actions"><button type="button" disabled={busy||sceneEditing||scenes[0]?.id===draftScene.id} onClick={()=>void perform(()=>workspace.reorderScenes(selectedChapterId,(()=>{const ids=scenes.map(s=>s.id);const i=ids.indexOf(draftScene.id);[ids[i-1],ids[i]]=[ids[i],ids[i-1]];return ids;})()),'Ordine aggiornato')}><ArrowUp size={16}/> Indietro</button>
       <button type="button" disabled={busy||sceneEditing||scenes.at(-1)?.id===draftScene.id} onClick={()=>void perform(()=>workspace.reorderScenes(selectedChapterId,(()=>{const ids=scenes.map(s=>s.id);const i=ids.indexOf(draftScene.id);[ids[i+1],ids[i]]=[ids[i],ids[i+1]];return ids;})()),'Ordine aggiornato')}><ArrowDown size={16}/> Avanti</button></div>
      </div>}
     </section>}
     </div>
     </section>}
   </div>
  </div>}
 </section>;
}
