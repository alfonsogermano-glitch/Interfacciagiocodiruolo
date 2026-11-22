import {CombatTracker} from '../../../src/app/components/gm/CombatTracker';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
import {CampaignScopeOverride} from './ArubaCampaignScopeContext';

/** The original session Combat panel, with only its campaign/data boundary
 * replaced by authenticated Aruba adapters from vite.config.mjs. */
export function ArubaSessionCombatPanel({campaign,onClose}:{campaign:Campaign;onClose:()=>void}){
 return <SlideOverPanel isOpen onClose={onClose}>
  <div className="h-full overflow-y-auto p-6">
   <CampaignScopeOverride campaign={campaign}><CombatTracker/></CampaignScopeOverride>
  </div>
 </SlideOverPanel>;
}
