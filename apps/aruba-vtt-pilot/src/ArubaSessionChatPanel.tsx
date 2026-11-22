import {useEffect} from 'react';
import {CampaignChatPanel} from '../../../src/app/components/session/CampaignChatPanel';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';
import {ArubaTopBarQaIdentity,type TopBarQaUser} from './ArubaOriginalTopBarAdapter';
import {setArubaChatCampaign} from './ArubaChatService';

export function ArubaSessionChatPanel({campaign,user,onClose}:{campaign:Campaign;user:TopBarQaUser;onClose:()=>void}){
 useEffect(()=>setArubaChatCampaign(campaign.id),[campaign.id]);
 return <SlideOverPanel isOpen onClose={onClose} panelWidth={420}>
  <ArubaTopBarQaIdentity user={user}><CampaignScopeOverride campaign={campaign}>
   <CampaignChatPanel incomingMessage={null} onPrivateConversationChange={()=>{}}/>
  </CampaignScopeOverride></ArubaTopBarQaIdentity>
 </SlideOverPanel>;
}
