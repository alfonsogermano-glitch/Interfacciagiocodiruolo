import {listArubaChapters,listArubaScenes} from './client.mjs';

export const loadChapters=(campaignId:string)=>listArubaChapters(fetch,campaignId);
export const loadScenes=(campaignId:string)=>listArubaScenes(fetch,campaignId);
