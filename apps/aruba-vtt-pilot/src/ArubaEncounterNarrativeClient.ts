import {listArubaNarrativeContent} from './client.mjs';

type Kind='npcs'|'monsters'|'clues'|'events';
const kinds:Record<string,Kind>={npcs:'npcs',monsters:'monsters',clues:'clues',situations:'events'};

export const isSupabaseConfigured=true;
export const supabase={
 from(table:string){
  return {select(){return {async eq(_field:string,campaignId:string){
   const kind=kinds[table];
   if(!kind)return {data:null,error:new Error('Collezione narrativa non autorizzata')};
   try{return {data:await listArubaNarrativeContent(fetch,campaignId,kind),error:null};}
   catch(error){return {data:null,error};}
  }}}};
 },
};
