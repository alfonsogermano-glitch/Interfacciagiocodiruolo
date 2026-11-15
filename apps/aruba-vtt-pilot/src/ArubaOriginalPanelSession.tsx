import {useArubaCampaignNotesContext} from './ArubaCampaignNotesContext';
export {useAuth} from './ArubaCampaignNotesContext';
export function useCampaign(){
 const {campaignId,ownerId,enabled}=useArubaCampaignNotesContext();
 return {
  activeCampaignId:enabled?campaignId:null,
  activeCampaign:enabled&&ownerId?{ownerId}:null,
  updateCampaign:async()=>{throw Error('Ordine sezioni Note non ancora disponibile su Aruba')},
 };
}
