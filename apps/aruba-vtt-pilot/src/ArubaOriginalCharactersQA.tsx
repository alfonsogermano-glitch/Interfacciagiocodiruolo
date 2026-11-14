import {useEffect,useState} from 'react';
import {listCharacterDrafts} from './client.mjs';

type Draft={id:string;campaignId:string;ownerId:string;name:string;status:string;sheetData:Record<string,unknown>};
function sheetSummary(value:Record<string,unknown>){
 return Object.entries(value).filter(([key,item])=>
  key.length<=80&&(typeof item==='string'||typeof item==='number'||typeof item==='boolean')&&
  String(item).length<=400).slice(0,24);
}
/** Read-only authenticated Aruba character index, deliberately separate from
 * original Supabase-backed character editor until its service is migrated. */
export function ArubaOriginalCharactersQA({campaignId,ownerId,enabled}:{
 campaignId:string|null;ownerId:string;enabled:boolean;
}){
 const [state,setState]=useState<{key:string;kind:'loading'|'ready'|'error';items:Draft[]}>({key:'',kind:'loading',items:[]});
 const key=enabled&&campaignId?ownerId+':'+campaignId:'';
 const [selected,setSelected]=useState<{key:string;id:string}|null>(null);
 useEffect(()=>{
  if(!key||!campaignId)return;
  let active=true;
  setSelected(null);
  setState({key,kind:'loading',items:[]});
  void listCharacterDrafts(fetch,campaignId,ownerId).then(items=>{
   if(active)setState({key,kind:'ready',items});
  }).catch(()=>{
   if(active)setState({key,kind:'error',items:[]});
  });
  return()=>{active=false;};
 },[key,campaignId,ownerId]);
 if(!enabled)return <p data-original-characters-state="unavailable">Personaggi non autorizzati.</p>;
 if(!campaignId)return <p data-original-characters-state="no-campaign">Seleziona una campagna per visualizzare i personaggi.</p>;
 if(state.key!==key||state.kind==='loading')return <p data-original-characters-state="loading">Caricamento personaggi…</p>;
 if(state.kind==='error')return <p data-original-characters-state="error">Impossibile caricare i personaggi Aruba.</p>;
 const detail=selected?.key===key?state.items.find(item=>item.id===selected.id):undefined;
 return <section data-original-characters-state="ready" className="space-y-4">
  <h2 className="text-xl font-semibold text-[var(--dash-text-strong)]">Personaggi</h2>
  {state.items.length===0?<p data-original-characters-empty="true">Nessun personaggio disponibile.</p>:
   <ul className="grid gap-3 sm:grid-cols-2">
    {state.items.map(item=><li key={item.id} data-original-character-id={item.id}>
     <button type="button" onClick={()=>setSelected({key,id:item.id})}
      aria-pressed={detail?.id===item.id}
      className="w-full min-w-0 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 text-left hover:border-[var(--dash-accent)]">
      <span className="block break-words font-semibold">{item.name}</span>
      <span className="text-xs text-[var(--dash-muted)]">{item.status==='draft'?'Bozza':'Attivo'}</span>
     </button>
    </li>)}
   </ul>}
  {detail&&<article data-original-character-detail={detail.id}
   className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
   <div className="mb-4 flex items-center justify-between gap-3">
    <h3 className="min-w-0 break-words text-lg font-semibold">{detail.name}</h3>
    <button type="button" onClick={()=>setSelected(null)} aria-label="Chiudi scheda">Chiudi</button>
   </div>
   <dl className="grid gap-3 sm:grid-cols-2">
    {sheetSummary(detail.sheetData).map(([field,value])=><div key={field} className="min-w-0">
     <dt className="break-words text-xs text-[var(--dash-muted)]">{field}</dt>
     <dd className="break-words whitespace-pre-wrap">{String(value)}</dd>
    </div>)}
   </dl>
   <p className="mt-4 text-xs text-[var(--dash-muted)]">Anteprima di sola lettura. La scheda originale completa è ancora in migrazione.</p>
  </article>}
 </section>;
}
