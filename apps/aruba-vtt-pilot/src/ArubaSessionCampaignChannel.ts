import {useCallback,useEffect,useRef,useState} from 'react';
import type {BroadcastEvent} from '../../../src/services/realtime/campaignChannelContract';
import {subscribeCampaignChannel} from './ArubaCampaignChannelRuntime.mjs';

type Options={onBroadcast?:Partial<Record<BroadcastEvent,(message:{event:BroadcastEvent;payload:Record<string,unknown>})=>void>>};

/** Transport-neutral runtime boundary. It remains false until a separately
 * verified WebRTC binding installs the exact campaign transport and marks its
 * data channel open; signaling readiness alone is never enough. */
export function useCampaignChannel(campaignId:string|null|undefined,options:Options={}){
 const optionsRef=useRef(options);optionsRef.current=options;
 const [isReady,setIsReady]=useState(false);
 const subscription=useRef<ReturnType<typeof subscribeCampaignChannel>|null>(null);
 useEffect(()=>{
  setIsReady(false);subscription.current?.close();subscription.current=null;
  if(!campaignId)return;
  const onBroadcast=Object.fromEntries(Object.keys(optionsRef.current.onBroadcast??{}).map(event=>[event,
   (message:unknown)=>(optionsRef.current.onBroadcast as Record<string,(value:unknown)=>void>|undefined)?.[event]?.(message)]));
  const active=subscribeCampaignChannel(campaignId,{onBroadcast,onReady:setIsReady});
  subscription.current=active;
  return()=>{active.close();if(subscription.current===active)subscription.current=null;};
 },[campaignId]);
 const send=useCallback(async(event:BroadcastEvent,payload:Record<string,unknown>)=>
  subscription.current?.send(event,payload)??false,[]);
 return {isReady,send,presenceState:()=>({})};
}
