import {useEffect,useState} from 'react';
import {listOwnedCampaignRoster} from './client.mjs';

type Member={userId:string;displayName:string;role:'gm'|'player'};
/** Aruba owner-only roster; never contacts legacy membership or presence. */
export function ArubaOriginalCampaignRosterQA({campaignId,enabled}:{campaignId:string;enabled:boolean}){
 const [state,setState]=useState<{id:string;status:'loading'|'ready'|'error';members:Member[]}>({id:'',status:'loading',members:[]});
 useEffect(()=>{
  if(!enabled)return;
  let active=true;
  setState({id:campaignId,status:'loading',members:[]});
  void listOwnedCampaignRoster(fetch,campaignId).then(members=>{
   if(active)setState({id:campaignId,status:'ready',members});
  }).catch(()=>{
   if(active)setState({id:campaignId,status:'error',members:[]});
  });
  return()=>{active=false;};
 },[campaignId,enabled]);
 if(!enabled)return <p data-original-roster-state="unavailable">Partecipanti non autorizzati.</p>;
 if(state.id!==campaignId||state.status==='loading')return <p data-original-roster-state="loading">Caricamento partecipanti…</p>;
 if(state.status==='error')return <p data-original-roster-state="error">Impossibile caricare i partecipanti.</p>;
 return <section data-original-roster-state="ready" className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-5">
  <h2 className="mb-3 text-lg font-semibold text-[var(--dash-text-strong)]">Partecipanti</h2>
  {state.members.length===0?<p data-original-roster-empty="true">Nessun partecipante disponibile.</p>:
   <ul className="space-y-2">{state.members.map(member=><li key={member.userId}
    className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--dash-border-soft)] pb-2">
    <span className="min-w-0 break-words">{member.displayName}</span>
    <span className="shrink-0 text-xs text-[var(--dash-muted)]">{member.role==='gm'?'GM':'Giocatore'}</span>
   </li>)}</ul>}
 </section>;
}
