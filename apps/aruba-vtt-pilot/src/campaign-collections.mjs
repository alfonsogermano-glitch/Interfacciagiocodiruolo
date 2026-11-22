import {listOwnedCampaigns,listJoinedPlayerCampaigns,CampaignSessionExpiredError} from './client.mjs';

// Independent authenticated reads. A broken player-list route must not hide
// valid owned campaigns (or vice versa). Never reuse stale lists on failure.
export async function loadCampaignCollections(fetchImpl,user){
  const results=await Promise.allSettled([
    user.campaignsEnabled?listOwnedCampaigns(fetchImpl,user.id):Promise.resolve([]),
    user.playerCharactersEnabled?listJoinedPlayerCampaigns(fetchImpl):Promise.resolve([]),
  ]);
  for(const result of results){
    if(result.status==='rejected'&&result.reason instanceof CampaignSessionExpiredError)
      throw result.reason; // Invalid session revokes both collections, not just one.
  }
  const errors=[];
  const collections=results.map((result,index)=>{
    if(result.status==='fulfilled')return result.value;
    // Only client-generated messages; never expose raw network exception text.
    errors.push(index===0?'Impossibile caricare le campagne di tua proprietà.':'Impossibile caricare le campagne a cui partecipi.');
    return [];
  });
  return {owned:collections[0],joined:collections[1],errors};
}
