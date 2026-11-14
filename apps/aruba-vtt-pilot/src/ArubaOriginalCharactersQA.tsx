import {useEffect,useState} from 'react';
import {listCharacterDrafts} from './client.mjs';

type Draft={id:string;campaignId:string;ownerId:string;name:string;status:string};
/** Read-only authenticated Aruba character index, deliberately separate from
 * original Supabase-backed character editor until its service is migrated. */
export function ArubaOriginalCharactersQA({campaignId,ownerId,enabled}:{
 campaignId:string|null;ownerId:string;enabled:boolean;
}){
 const [state,setState]=useState<{key:string;kind:'loading'|'ready'|'error';items:Draft[]}>({key:'',kind:'loading',items:[]});
 const key=enabled&&campaignId?ownerId+':'+campaignId:'';
 useEffect(()=>{
  if(!key||!campaignId)return;
  let active=true;
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
 return <section data-original-characters-state="ready" className="space-y-4">
  <h2 className="text-xl font-semibold text-[var(--dash-text-strong)]">Personaggi</h2>
  {state.items.length===0?<p data-original-characters-empty="true">Nessun personaggio disponibile.</p>:
   <ul className="grid gap-3 sm:grid-cols-2">
    {state.items.map(item=><li key={item.id} data-original-character-id={item.id}
     className="min-w-0 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4">
     <span className="block break-words font-semibold">{item.name}</span>
     <span className="text-xs text-[var(--dash-muted)]">{item.status==='draft'?'Bozza':'Attivo'}</span>
    </li>)}
   </ul>}
 </section>;
}
