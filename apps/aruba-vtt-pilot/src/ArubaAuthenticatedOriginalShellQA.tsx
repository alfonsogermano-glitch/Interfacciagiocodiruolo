import {useEffect,useState} from 'react';
import {ArubaOriginalShellParity} from './ArubaOriginalShellParity';
import {loadPilotSession,listOwnedCampaigns} from './client.mjs';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';

/** Disposable, read-only integration contract for the ORIGINAL layout.
 * It cannot create, write, join a campaign, or render unauthenticated data.
 * No preview route or app deployment imports this component.
 */
type State=
 | {kind:'loading'}
 | {kind:'unauthorized'}
 | {kind:'unavailable'}
 | {kind:'error';message:string}
 | {kind:'ready';name:string;campaigns:Campaign[]};

export function ArubaAuthenticatedOriginalShellQA(){
 const [state,setState]=useState<State>({kind:'loading'});
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const user=await loadPilotSession(fetch);
    if(!active)return;
    if(!user){setState({kind:'unauthorized'});return;}
    if(!user.campaignsEnabled){setState({kind:'unavailable'});return;}
    const owned=await listOwnedCampaigns(fetch,user.id);
    if(!active)return;
    // The frontend's owner filter is only display defense; the server
    // MUST verify the cookie and ownership on its own for every API call.
    const campaigns:Campaign[]=owned.map(c=>({
     ...c,ruleset:c.ruleset as Campaign['ruleset'],
     updatedAt:c.createdAt??'',
    }));
    setState({kind:'ready',name:user.displayName,campaigns});
   }catch(e){
    if(active)setState({kind:'error',message:e instanceof Error?e.message:'Errore autenticazione'});
   }
  })();
  return()=>{active=false;};
 },[]);
 if(state.kind!=='ready')return <main data-original-shell-auth-state={state.kind}
  className="min-h-screen bg-[var(--dash-bg)] p-8 text-[var(--dash-text)]">
  {state.kind==='loading'?'Verifica accesso Aruba…':
   state.kind==='unauthorized'?'Accesso richiesto: effettua il login.':
   state.kind==='unavailable'?'Campagne non autorizzate per questo account.':
   'Non è stato possibile caricare le campagne Aruba.'}
 </main>;
 return <div data-original-shell-auth-state="ready">
  <ArubaOriginalShellParity campaigns={state.campaigns} displayName={state.name}/>
 </div>;
}
