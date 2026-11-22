import {isBroadcastEvent} from '../../../src/services/realtime/campaignChannelContract.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entries=new Map();
const clone=value=>JSON.parse(JSON.stringify(value));
const createEntry=campaignId=>({campaignId,send:null,ready:false,closed:false,eventListeners:new Map(),stateListeners:new Set()});
const maybeDelete=entry=>{
 if(entry.send===null&&entry.stateListeners.size===0&&[...entry.eventListeners.values()].every(listeners=>listeners.size===0))
  entries.delete(entry.campaignId);
};

function notify(entry){
 for(const listener of entry.stateListeners){try{listener(entry.ready);}catch{/* isolate consumers */}}
}

export function installCampaignChannelTransport({campaignId,send}){
 if(!UUID.test(campaignId??'')||typeof send!=='function')
  throw new TypeError('Unique verified campaign transport required');
 const entry=entries.get(campaignId)??createEntry(campaignId);
 if(entry.send!==null)throw new TypeError('Unique verified campaign transport required');
 entry.send=send;entry.closed=false;entries.set(campaignId,entry);
 return Object.freeze({
  setReady(ready){
   if(entry.closed||entry.send===null||typeof ready!=='boolean')return false;
   if(entry.ready===ready)return true;
   entry.ready=ready;notify(entry);return true;
  },
  receive(event,payload){
   if(entry.closed||entry.send===null||!entry.ready||!isBroadcastEvent(event)||!payload||typeof payload!=='object'||Array.isArray(payload))return false;
   let safe;try{safe=clone(payload);}catch{return false;}
   for(const listener of entry.eventListeners.get(event)??[]){try{listener({event,payload:clone(safe)});}catch{/* isolate consumers */}}
   return true;
  },
  close(){
   if(entry.closed||entry.send===null)return;const wasReady=entry.ready;entry.closed=true;entry.ready=false;entry.send=null;if(wasReady)notify(entry);maybeDelete(entry);
  },
 });
}

export function subscribeCampaignChannel(campaignId,{onBroadcast,onReady}){
 if(!UUID.test(campaignId??'')||typeof onReady!=='function')return Object.freeze({ready:false,send:async()=>false,close(){}});
 const entry=entries.get(campaignId)??createEntry(campaignId);entries.set(campaignId,entry);
 const registrations=[];
 if(onBroadcast&&typeof onBroadcast==='object')for(const [event,listener] of Object.entries(onBroadcast)){
  if(!isBroadcastEvent(event)||typeof listener!=='function')continue;
  let listeners=entry.eventListeners.get(event);if(!listeners){listeners=new Set();entry.eventListeners.set(event,listeners);}
  listeners.add(listener);registrations.push([event,listener]);
 }
 entry.stateListeners.add(onReady);onReady(entry.ready);
 let active=true;
 return Object.freeze({
  get ready(){return active&&entry.ready;},
  async send(event,payload){
   if(!active||entry.closed||entry.send===null||!entry.ready||!isBroadcastEvent(event)||!payload||typeof payload!=='object'||Array.isArray(payload))return false;
   let safe;try{safe=clone(payload);}catch{return false;}
   try{return await entry.send(event,safe)===true;}catch{return false;}
  },
  close(){if(!active)return;active=false;entry.stateListeners.delete(onReady);for(const [event,listener] of registrations)entry.eventListeners.get(event)?.delete(listener);maybeDelete(entry);},
 });
}

export function hasReadyCampaignTransport(campaignId){const entry=entries.get(campaignId);return entry?.send!==null&&entry?.ready===true;}
