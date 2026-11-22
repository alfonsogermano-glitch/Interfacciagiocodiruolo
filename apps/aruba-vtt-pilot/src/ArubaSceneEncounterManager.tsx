import {useEffect,useMemo,useState} from 'react';
import {Ghost,Lightbulb,MapPin,Play,Scroll,Swords} from 'lucide-react';
import {listArubaChapters,listArubaNarrativeContent,listArubaScenes} from './client.mjs';

type Chapter={id:string;title:string;mapUrl?:string|null;mapMetadata?:{gridVisible?:boolean;gridColumns?:number;gridRows?:number}};
type Region={id:string;color:string;geometry:{kind:'rect';rect:{x:number;y:number;width:number;height:number}}|{kind:'polygon';points:{x:number;y:number}[]}};
type Scene={id:string;chapterId:string;title:string;description:string;status:string;sortOrder:number;environmentId?:string|null;mapRegions:Region[]};
type Linked={id:string;name?:string;title?:string;description?:string;role?:string;chapterId?:string|null;sceneId?:string|null;environmentId?:string|null;discovered?:boolean};
type Kind='npcs'|'monsters'|'clues'|'events';
const groups:{kind:Kind;title:string;Icon:typeof Ghost;empty:string}[]=[
 {kind:'npcs',title:'PNG',Icon:Ghost,empty:'Nessun PNG collegato.'},{kind:'monsters',title:'Mostri',Icon:Swords,empty:'Nessun mostro collegato.'},
 {kind:'clues',title:'Indizi',Icon:Lightbulb,empty:'Nessun indizio collegato.'},{kind:'events',title:'Eventi',Icon:Scroll,empty:'Nessun evento collegato.'},
];
const itemLabel=(kind:Kind,item:Linked)=>kind==='clues'||kind==='events'?item.title||'Senza titolo':item.name||'Senza nome';
export function ArubaSceneEncounterManager({campaignId,enabled}:{campaignId:string;enabled:boolean}){
 const [chapters,setChapters]=useState<Chapter[]>([]),[scenes,setScenes]=useState<Scene[]>([]),[content,setContent]=useState<Record<Kind,Linked[]>>({npcs:[],monsters:[],clues:[],events:[]});
 const [selectedId,setSelectedId]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;if(!enabled){setLoading(false);return;}setLoading(true);setError('');Promise.all([
  listArubaChapters(fetch.bind(window),campaignId),listArubaScenes(fetch.bind(window),campaignId),...groups.map(group=>listArubaNarrativeContent(fetch.bind(window),campaignId,group.kind)),
 ]).then(([chapterList,sceneList,...lists])=>{if(!live)return;setChapters(chapterList);setScenes(sceneList);setContent(Object.fromEntries(groups.map((group,index)=>[group.kind,lists[index]])) as Record<Kind,Linked[]>);})
  .catch(reason=>{if(live)setError(reason instanceof Error?reason.message:'Caricamento preparazione non riuscito');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[campaignId,enabled]);
 const ordered=useMemo(()=>[...scenes].sort((a,b)=>(chapters.find(c=>c.id===a.chapterId)?.title??'').localeCompare(chapters.find(c=>c.id===b.chapterId)?.title??'','it')||a.sortOrder-b.sortOrder||a.title.localeCompare(b.title,'it')),[chapters,scenes]);
 const scene=scenes.find(item=>item.id===selectedId)??null,chapter=scene?chapters.find(item=>item.id===scene.chapterId)??null:null;
 const linked=(kind:Kind)=>scene?content[kind].filter(item=>item.sceneId===scene.id||(!item.sceneId&&item.chapterId===scene.chapterId)||(!item.sceneId&&!!scene.environmentId&&item.environmentId===scene.environmentId)):[];
 if(!enabled)return <div className="placeholder"><Play/><h2>Preparazione non disponibile</h2><p>Capitoli, Scene e Contenuti devono essere autorizzati dal backend Aruba.</p></div>;
 return <section className="aruba-encounter" aria-label="Preparazione Scene e Incontri"><header><div><span className="overline">PREPARAZIONE SESSIONE</span><h1><Play/> Scene &amp; Encounter</h1><p className="muted">Consulta la Scena e le entità collegate durante la sessione.</p></div>
  <select aria-label="Seleziona scena" value={selectedId} onChange={event=>setSelectedId(event.target.value)} disabled={loading}><option value="">Seleziona scena...</option>{ordered.map(item=><option key={item.id} value={item.id}>{chapters.find(c=>c.id===item.chapterId)?.title??'Capitolo'} · {item.title} ({item.status==='ready'?'pronta':item.status==='completed'?'conclusa':'preparazione'})</option>)}</select></header>
  {error&&<p role="alert" className="error">{error}</p>}{loading?<p className="muted">Caricamento preparazione...</p>:!scene||!chapter?<div className="placeholder"><MapPin/><h2>Nessuna scena selezionata</h2><p>Prepara le Scene nei Capitoli, poi seleziona qui quella da consultare.</p></div>:<>
   <article className="aruba-encounter-preview"><div><span className="overline">{chapter.title}</span><h2>{scene.title}</h2><p className="muted">{scene.description||'Nessuna descrizione.'}</p><span className="aruba-status">{scene.status==='ready'?'Pronta':scene.status==='completed'?'Conclusa':'In preparazione'}</span></div>
    <div className="aruba-encounter-map">{chapter.mapUrl?<img src={chapter.mapUrl} alt={`Mappa di ${chapter.title}`}/>:<span>Mappa non configurata</span>}<svg viewBox="0 0 100 100" preserveAspectRatio="none">{scene.mapRegions.map(region=>region.geometry.kind==='rect'?<rect key={region.id} {...region.geometry.rect} fill={region.color} fillOpacity=".25" stroke={region.color}/>:<polygon key={region.id} points={region.geometry.points.map(point=>`${point.x},${point.y}`).join(' ')} fill={region.color} fillOpacity=".25" stroke={region.color}/>)}</svg></div>
   </article><div className="aruba-encounter-groups">{groups.map(({kind,title,Icon,empty})=>{const items=linked(kind);return <article key={kind}><header><Icon/><h3>{title}</h3><span>{items.length}</span></header>{items.length?<ul>{items.map(item=><li key={item.id}><strong>{itemLabel(kind,item)}</strong><span>{kind==='npcs'?item.role:kind==='clues'?(item.discovered?'Scoperto':'Non scoperto'):item.description}</span></li>)}</ul>:<p className="muted">{empty}</p>}</article>;})}</div>
  </>}
 </section>;
}
