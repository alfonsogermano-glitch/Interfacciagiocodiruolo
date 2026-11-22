import {SessionWorkspace} from '../../../src/app/components/session/SessionWorkspace';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';

/** The original renderer in its native non-owner mode. No owner campaign
 * document hook is enabled; map state arrives only from the verified channel. */
export function ArubaOriginalPlayerSessionWorkspace({campaign,userId,onClose}:{campaign:Campaign;userId:string;onClose:()=>void}){
 return <section className="aruba-original-session-workspace" aria-label="Workspace mappa giocatore Aruba">
  <CampaignScopeOverride campaign={campaign}>
   <SessionWorkspace campaignId={campaign.id} campaignName={campaign.name}
    campaignLogoUrl={null} isOwner={false} currentUserId={userId} currentUserAccessToken={null}
    onEndSession={async()=>onClose()}/>
  </CampaignScopeOverride>
 </section>;
}
