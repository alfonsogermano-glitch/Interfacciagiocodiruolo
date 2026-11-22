export async function loadMonsters(campaignId:string){
  const response=await fetch(`/vtt/campaigns/${campaignId}/narrative/monsters`,{credentials:'include',headers:{accept:'application/json'}});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.items))throw new Error(data.error??'Mostri non disponibili');
  return data.items.map((item:Record<string,unknown>)=>({id:item.id,name:item.name,freschezza:item.freschezza??null,maxFreschezza:item.maxFreschezza??null,notes:typeof item.notes==='string'?item.notes:typeof item.description==='string'?item.description:''}));
}

export async function loadChapters(campaignId:string){
  const response=await fetch(`/vtt/campaigns/${campaignId}/chapters`,{credentials:'include',headers:{accept:'application/json'}});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.chapters))throw new Error(data.error??'Capitoli non disponibili');
  return data.chapters;
}

export async function loadScenes(campaignId:string){
  const response=await fetch(`/vtt/campaigns/${campaignId}/scenes`,{credentials:'include',headers:{accept:'application/json'}});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data.scenes))throw new Error(data.error??'Scene non disponibili');
  return data.scenes;
}
