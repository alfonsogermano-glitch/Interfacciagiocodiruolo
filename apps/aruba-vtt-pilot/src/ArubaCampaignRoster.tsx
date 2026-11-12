import {useEffect,useState} from 'react';
import {listOwnedCampaignRoster} from './client.mjs';
type Member={userId:string;displayName:string;role:'gm'|'player';joinedAt?:string};
/** No membership writes, roles are established by PostgreSQL, not browser. */
export function ArubaCampaignRoster({campaignId}:{campaignId:string}){
 const [members,setMembers]=useState<Member[]>([]);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let alive=true;setBusy(true);setError(null);setMembers([]);
  void listOwnedCampaignRoster(fetch,campaignId)
   .then(rows=>{if(alive)setMembers(rows);})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Partecipanti non disponibili');})
   .finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[campaignId]);
 return <section className="aruba-campaign-roster" aria-label="Partecipanti campagna">
  <h2>Partecipanti</h2>
  <p className="muted">Elenco di sola lettura · ruoli verificati dal server</p>
  {busy&&<p role="status">Caricamento partecipanti…</p>}
  {error&&<p role="alert">{error}</p>}
  {!busy&&!error&&members.map(m=><div className="aruba-campaign-member" key={m.userId}>
   <span>{m.displayName}</span><strong>{m.role==='gm'?'Game Master':'Giocatore'}</strong>
  </div>)}
 </section>;
}
