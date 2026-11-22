import {listArubaChapters,listArubaScenes} from './client.mjs';

/** Owner-scoped replacements used only by the original SessionWorkspace. */
export function loadChapters(campaignId:string){
 return listArubaChapters(fetch,campaignId);
}
export function loadScenes(campaignId:string){
 return listArubaScenes(fetch,campaignId);
}
