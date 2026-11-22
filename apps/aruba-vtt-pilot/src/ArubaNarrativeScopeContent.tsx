import {useEffect,useState} from 'react';
import {Ghost,Lightbulb,Plus,Scroll,Swords,X} from 'lucide-react';
import {listArubaNarrativeContent,saveArubaNarrativeContent} from './client.mjs';

type Kind='npcs'|'monsters'|'clues'|'events';
type Item={id:string;campaignId:string;chapterId?:string|null;sceneId?:string|null;name?:string;title?:string};
const kinds:Kind[]=['npcs','monsters','clues','events'];
const meta={npcs:{title:'PNG',Icon:Ghost},monsters:{title:'Mostri',Icon:Swords},clues:{title:'Indizi',Icon:Lightbulb},events:{title:'Eventi',Icon:Scroll}};
const label=(kind:Kind,item:Item)=>kind==='clues'||kind==='events'?item.title||'Senza titolo':item.name||'Senza nome';

export function ArubaNarrativeScopeContent({campaignId,chapterId,sceneId}:{campaignId:string;chapterId:string;sceneId?:string}){
 const [groups,setGroups]=useState<Record<Kind,Item[]>>({npcs:[],monsters:[],clues:[],events:[]});
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);setError('');Promise.all(kinds.map(kind=>listArubaNarrativeContent(fetch.bind(window),campaignId,kind)))
  .then(values=>{if(active)setGroups(Object.fromEntries(kinds.map((kind,index)=>[kind,values[index]])) as Record<Kind,Item[]>);})
  .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Caricamento contenuti non riuscito');})
  .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[campaignId]);
 const belongs=(item:Item)=>sceneId?item.sceneId===sceneId:item.chapterId===chapterId&&!item.sceneId;
 const available=(item:Item)=>sceneId?(!item.chapterId&&!item.sceneId)||(item.chapterId===chapterId&&!item.sceneId):!item.chapterId&&!item.sceneId;
 async function place(kind:Kind,item:Item,placement:{chapterId:string|null;sceneId:string|null}){
  const key=`${kind}:${item.id}`;setSaving(key);setError('');
  try{const saved=await saveArubaNarrativeContent(fetch.bind(window),campaignId,kind,{...item,...placement});
   setGroups(current=>({...current,[kind]:current[kind].map(value=>value.id===saved.id?saved:value)}));
  }catch(reason){setError(reason instanceof Error?reason.message:'Assegnazione non riuscita');}finally{setSaving(null);}
 }
 return <section className="aruba-narrative-scope" aria-label={sceneId?'Contenuti della scena':'Contenuti del capitolo'}>
  <div><h4>{sceneId?'Contenuti della scena':'Contenuti del capitolo'}</h4><p className="muted">{sceneId?'Focus locali di questa scena. Rimuovendoli, tornano al contesto generale del capitolo.':'Presenze ed eventi della mappa generale, non limitati a una singola scena.'}</p></div>
  {error&&<p role="alert" className="error">{error}</p>}
  {loading?<p className="muted">Caricamento contenuti...</p>:<div className="aruba-narrative-grid">{kinds.map(kind=>{const Icon=meta[kind].Icon,items=groups[kind].filter(belongs),choices=groups[kind].filter(available);return <div className="aruba-narrative-group" key={kind}>
   <header><Icon size={16}/><strong>{meta[kind].title}</strong><span>{items.length}</span></header>
   {items.length?<ul>{items.map(item=><li key={item.id}><span>{label(kind,item)}</span><button type="button" aria-label={`Rimuovi ${label(kind,item)}`} disabled={saving===`${kind}:${item.id}`} onClick={()=>void place(kind,item,sceneId?{chapterId,sceneId:null}:{chapterId:null,sceneId:null})}><X size={14}/></button></li>)}</ul>:<p className="muted">Nessun contenuto assegnato.</p>}
   <label><Plus size={14}/><select aria-label={`Aggiungi ${meta[kind].title}`} value="" disabled={!choices.length||saving!==null} onChange={event=>{const item=choices.find(value=>value.id===event.target.value);if(item)void place(kind,item,{chapterId,sceneId:sceneId??null});}}><option value="">{choices.length?'Aggiungi...':'Nessun elemento disponibile'}</option>{choices.map(item=><option key={item.id} value={item.id}>{label(kind,item)}</option>)}</select></label>
  </div>;})}</div>}
 </section>;
}
