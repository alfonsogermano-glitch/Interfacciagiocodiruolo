import {SessionWorkspace} from '../../../src/app/components/session/SessionWorkspace';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {useCallback,useEffect,useRef} from 'react';
import {installGmWorkspaceRuntime} from './ArubaGmWorkspaceRuntime.mjs';

export function ArubaOriginalSessionWorkspace({campaign,userId,onClose}:{campaign:Campaign;userId:string;onClose:()=>void}){
 const registration=useRef<{close:()=>void}|null>(null);
 const register=useCallback((runtime:any|null)=>{
  registration.current?.close();registration.current=null;
  if(runtime)registration.current=installGmWorkspaceRuntime(campaign.id,runtime);
 },[campaign.id]);
 useEffect(()=>()=>{registration.current?.close();registration.current=null;},[campaign.id]);
 return <section className="aruba-original-session-workspace" aria-label="Workspace mappa Aruba">
  <CampaignScopeOverride campaign={campaign}>
   <SessionWorkspace campaignId={campaign.id} campaignName={campaign.name}
     campaignLogoUrl={null} isOwner currentUserId={userId} currentUserAccessToken={null}
     allowOwnerPublicationWithoutChannel
     onAuthoritativeMapRuntime={register}
    onEndSession={async()=>onClose()}/>
  </CampaignScopeOverride>
 </section>;
}
