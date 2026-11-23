import {createContext,useContext,useState} from 'react';
import {MyCharactersPage} from '../../../src/app/components/gm/MyCharactersPage';
import {ArubaTopBarQaIdentity,type TopBarQaUser} from './ArubaOriginalTopBarAdapter';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {unavailableCatalogAction} from './catalog-client.mjs';

type Scope={campaigns:Campaign[];joinedCampaigns:Campaign[];
 refreshCampaigns:()=>Promise<void>;refreshJoinedCampaigns:()=>Promise<void>};
const Context=createContext<Scope|null>(null);
export function useCampaign(){
 const scope=useContext(Context);
 if(!scope)throw Error('Contesto catalogo Aruba mancante');
 return {...scope,previewInviteCode:unavailableCatalogAction,joinCampaignByCode:unavailableCatalogAction};
}
export function ArubaOriginalCatalog({user,campaigns,joinedCampaigns,refreshCampaigns,refreshJoinedCampaigns}:Scope&{user:TopBarQaUser}){
 const [detail,setDetail]=useState<{entityType:'character'|'npc'|'monster';id:string}|null>(null);
 return <ArubaTopBarQaIdentity user={user}>
  <Context.Provider value={{campaigns,joinedCampaigns,refreshCampaigns,refreshJoinedCampaigns}}>
   <MyCharactersPage detailContext={detail}
    onOpenDetail={(entityType,id)=>setDetail({entityType,id})} onCloseDetail={()=>setDetail(null)}/>
  </Context.Provider>
 </ArubaTopBarQaIdentity>;
}
