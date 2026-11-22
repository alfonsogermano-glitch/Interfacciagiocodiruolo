import type {Campaign} from '../../../src/app/campaigns/campaignTypes';
const scopeKey='__HG_ARUBA_CAMPAIGN_SCOPE__';
export function CampaignScopeOverride({campaign,children}:{campaign:Campaign;children:React.ReactNode}){(globalThis as typeof globalThis&{[scopeKey]?:Campaign})[scopeKey]=campaign;return <>{children}</>;}
export function useCampaign(){const current=(globalThis as typeof globalThis&{[scopeKey]?:Campaign})[scopeKey];if(!current)throw new Error('Campaign scope Aruba mancante');return {activeCampaignId:current.id,activeCampaign:current};}
