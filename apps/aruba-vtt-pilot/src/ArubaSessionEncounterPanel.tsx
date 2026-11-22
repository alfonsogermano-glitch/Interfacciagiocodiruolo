import {SceneEncounterManager} from '../../../src/app/components/gm/SceneEncounterManager';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';

export function ArubaSessionEncounterPanel({campaign,onClose}:{campaign:Campaign;onClose:()=>void}){
 return <SlideOverPanel isOpen onClose={onClose}>
  <div className="h-full overflow-y-auto p-6">
   <CampaignScopeOverride campaign={campaign}><SceneEncounterManager/></CampaignScopeOverride>
  </div>
 </SlideOverPanel>;
}
