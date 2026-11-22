import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {Ghost,Lightbulb,Plus,Scroll,Search,Swords,Trash2,X} from 'lucide-react';
import {deleteArubaNarrativeContent,listArubaNarrativeContent,saveArubaNarrativeContent} from './client.mjs';

type Kind='npcs'|'monsters'|'clues'|'events';
type Item={id:string;campaignId:string;chapterId?:string|null;sceneId?:string|null;name?:string;title?:string;role?:string;description?:string;location?:string;trigger?:string;consequences?:string[];choices?:{text:string;outcome:string}[];personality?:string;secrets?:string;attacco?:string;difesa?:string;puntoDebole?:string;discovered?:boolean;createdAt?:string;updatedAt?:string};
const config={
 npcs:{singular:'PNG',plural:'PNG',Icon:Ghost,label:'name',subtitle:'role'},
 monsters:{singular:'Mostro',plural:'Mostri',Icon:Swords,label:'name',subtitle:'attacco'},
 clues:{singular:'Indizio',plural:'Indizi',Icon:Lightbulb,label:'title',subtitle:'location'},
 events:{singular:'Evento',plural:'Eventi',Icon:Scroll,label:'title',subtitle:'trigger'},
} as const;
const empty=(campaignId:string,kind:Kind):Item=>({id:crypto.randomUUID(),campaignId,chapterId:null,sceneId:null,
 ...(kind==='clues'?{title:'',description:'',location:'',discovered:false}:kind==='events'?{title:'',description:'',trigger:'',consequences:[],choices:[]}:{name:'',description:'',...(kind==='npcs'?{role:'',personality:'',secrets:''}:{attacco:'',difesa:'',puntoDebole:''})})});

export function ArubaNarrativeManager({campaignId,kind,enabled,initialSelection}:{campaignId:string;kind:Kind;enabled:boolean;initialSelection?:{id:string;requestId:number}|null}){
 const meta=config[kind],Icon=meta.Icon;
 const [items,setItems]=useState<Item[]>([]),[selectedId,setSelectedId]=useState<string|null>(null),[draft,setDraft]=useState<Item|null>(null);
 const [query,setQuery]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const label=(item:Item)=>String(item[meta.label]??'');
  useEffect(()=>{let active=true;if(!enabled){setLoading(false);return;}setLoading(true);setError('');
   listArubaNarrativeContent(fetch.bind(window),campaignId,kind).then(result=>{if(active){setItems(result);if(initialSelection&&result.some(item=>item.id===initialSelection.id)){setSelectedId(initialSelection.id);setDraft(null);}}})
    .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Caricamento non riuscito');})
    .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[campaignId,kind,enabled,initialSelection?.requestId]);
 const visible=useMemo(()=>items.filter(item=>[label(item),item.description,item[meta.subtitle]].some(value=>String(value??'').toLowerCase().includes(query.trim().toLowerCase()))),[items,query,meta.label,meta.subtitle]);
 const selected=draft?.id===selectedId?draft:items.find(item=>item.id===selectedId)??null;
 function update(key:string,value:unknown){if(selected)setDraft({...selected,[key]:value});}
 async function save(event:FormEvent){event.preventDefault();if(!draft||!label(draft).trim()||saving)return;setSaving(true);setError('');try{
  const saved=await saveArubaNarrativeContent(fetch.bind(window),campaignId,kind,draft);
  setItems(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?saved:item):[saved,...current]);setDraft(null);setSelectedId(saved.id);
 }catch(reason){setError(reason instanceof Error?reason.message:'Salvataggio non riuscito');}finally{setSaving(false);}}
 async function remove(){if(!selected||saving||!confirm(`Eliminare ${label(selected)}?`))return;setSaving(true);setError('');try{
  await deleteArubaNarrativeContent(fetch.bind(window),campaignId,kind,selected.id);setItems(current=>current.filter(item=>item.id!==selected.id));setDraft(null);setSelectedId(null);
 }catch(reason){setError(reason instanceof Error?reason.message:'Eliminazione non riuscita');}finally{setSaving(false);}}
 if(!enabled)return <div className="placeholder"><span className="placeholder-mark">✧</span><h2>Archivio {meta.plural} non disponibile</h2><p>Il servizio Aruba è disabilitato e non vengono mostrati dati simulati.</p></div>;
 return <section className="aruba-narrative-manager" aria-label={`Archivio ${meta.plural}`}>
  <header className="aruba-manager-title"><div><span className="overline">ARCHIVIO NARRATIVO</span><h1><Icon/> {meta.plural}</h1><p className="muted">Contenuti persistiti nel backend Aruba della campagna selezionata.</p></div>
   <button type="button" onClick={()=>{const item=empty(campaignId,kind);setDraft(item);setSelectedId(item.id);}}><Plus size={18}/> Nuovo {meta.singular}</button></header>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="aruba-manager-layout"><aside><label className="aruba-manager-search"><Search size={16}/><input aria-label={`Cerca ${meta.plural}`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca..."/></label>
   {loading?<p className="muted">Caricamento...</p>:visible.length?<ul>{visible.map(item=><li key={item.id}><button type="button" className={selectedId===item.id?'active':''} onClick={()=>{setSelectedId(item.id);setDraft(null);}}><strong>{label(item)}</strong><span>{String(item[meta.subtitle]??'Non assegnato')}</span></button></li>)}</ul>:<p className="muted">Nessun contenuto trovato.</p>}</aside>
   <div className="aruba-manager-detail">{selected?<form onSubmit={save}><div className="aruba-manager-detail-head"><h2>{draft?.id===selected.id&&!items.some(item=>item.id===selected.id)?`Nuovo ${meta.singular}`:label(selected)}</h2><button type="button" aria-label="Chiudi dettaglio" className="icon-button" onClick={()=>{setSelectedId(null);setDraft(null);}}><X/></button></div>
     <label>{kind==='clues'||kind==='events'?'Titolo':'Nome'}<input required maxLength={200} value={label(selected)} onChange={e=>update(meta.label,e.target.value)}/></label>
    {kind==='npcs'&&<label>Ruolo<input value={selected.role??''} onChange={e=>update('role',e.target.value)}/></label>}
    {kind==='clues'&&<label>Luogo<input value={selected.location??''} onChange={e=>update('location',e.target.value)}/></label>}
    {kind==='events'&&<label>Innesco<input value={selected.trigger??''} onChange={e=>update('trigger',e.target.value)}/></label>}
    {kind==='monsters'&&<div className="aruba-manager-fields"><label>Attacco<input value={selected.attacco??''} onChange={e=>update('attacco',e.target.value)}/></label><label>Difesa<input value={selected.difesa??''} onChange={e=>update('difesa',e.target.value)}/></label></div>}
     <label>Descrizione<textarea rows={6} value={selected.description??''} onChange={e=>update('description',e.target.value)}/></label>
     {kind==='events'&&<><label>Conseguenze<textarea aria-label="Conseguenze" rows={4} value={(selected.consequences??[]).join('\n')} onChange={e=>update('consequences',e.target.value.split('\n').map(value=>value.trim()).filter(Boolean).slice(0,100))} placeholder="Una conseguenza per riga"/></label><label>Scelte e risultati<textarea aria-label="Scelte e risultati" rows={5} value={(selected.choices??[]).map(choice=>`${choice.text} => ${choice.outcome}`).join('\n')} onChange={e=>update('choices',e.target.value.split('\n').map(line=>{const [text,...outcome]=line.split('=>');return {text:text.trim(),outcome:outcome.join('=>').trim()};}).filter(choice=>choice.text).slice(0,100))} placeholder="Scelta => risultato, una per riga"/></label></>}
    {kind==='clues'&&<label className="check"><input type="checkbox" checked={!!selected.discovered} onChange={e=>update('discovered',e.target.checked)}/> Indizio scoperto</label>}
    <p className="muted">{selected.sceneId?'Assegnato a una Scena':selected.chapterId?'Assegnato a un Capitolo':'Contesto generale della campagna'}</p>
    <div className="aruba-manager-actions"><button type="submit" disabled={saving||!label(selected).trim()}>{saving?'Salvataggio...':'Salva'}</button>{items.some(item=>item.id===selected.id)&&<button type="button" className="danger" disabled={saving} onClick={()=>void remove()}><Trash2 size={16}/> Elimina</button>}</div>
   </form>:<div className="placeholder"><Icon/><h2>Seleziona un elemento</h2><p>Apri un contenuto dall’archivio oppure creane uno nuovo.</p></div>}</div></div>
 </section>;
}
