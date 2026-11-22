import {useCallback,useEffect,useRef,useState} from 'react';
import type {ActiveSceneMapFields,ActiveScenePublication} from '../../../src/types/activeScene';
import {isActiveScenePublication} from '../../../src/types/activeScene';
import {buildPersistedMapPublication,mergePendingMapPublication,type PendingMapPublication} from '../../../src/app/components/session/mapPublicationBatch';
import {deleteCampaignDocument,loadCampaignDocumentOrNull,saveCampaignDocument} from './ArubaCampaignDocuments';
import {useCampaignChannel} from './ArubaSessionCampaignChannel';

const KEY='active-scene';
/** Owner persists the original publication; players only consume the verified
 * campaign runtime and never mount owner document reads or writes. */
export function useActiveScene(campaignId:string|null|undefined,{owner=false}:{owner?:boolean}={}){
 const [activeScene,setActiveScene]=useState<ActiveScenePublication|null>(null);
 const [loading,setLoading]=useState(!!campaignId);
 const latest=useRef<ActiveScenePublication|null>(null);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const pending=useRef<PendingMapPublication|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clock=useRef(0);
 const scope=useRef(campaignId);
 scope.current=campaignId;
 const {isReady:channelReady,send}=useCampaignChannel(campaignId,{
  onBroadcast:{active_scene_change:message=>{
   const value=message?.payload?.activeScene;
   if(value!==null&&!isActiveScenePublication(value))return;
   latest.current=value;setActiveScene(value);setLoading(false);
  }},
 });
 useEffect(()=>{
  let alive=true;
  setLoading(!!campaignId);setActiveScene(null);latest.current=null;clock.current=0;
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  pending.current=null;queue.current=Promise.resolve();
   if(campaignId&&owner)void loadCampaignDocumentOrNull<ActiveScenePublication>(campaignId,KEY)
   .then(value=>{if(alive){latest.current=value;setActiveScene(value);}})
   .catch(()=>{})
   .finally(()=>{if(alive)setLoading(false);});
   else setLoading(false);
  return()=>{alive=false;if(timer.current){clearTimeout(timer.current);timer.current=null;}pending.current=null;};
  },[campaignId,owner]);
 const commit=useCallback((target:string,value:ActiveScenePublication)=>{
  const operation=queue.current.then(async()=>{
    if(!owner)return;
    await saveCampaignDocument(target,KEY,value);
    if(scope.current===target){latest.current=value;setActiveScene(value);}
  });
  queue.current=operation.catch(()=>{});
  return operation;
  },[owner,send]);
 const flushPending=useCallback(()=>{
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  const queued=pending.current;pending.current=null;
   if(!owner||!queued||!campaignId||scope.current!==campaignId)return Promise.resolve();
  const target=campaignId;
  const publishedAtMs=Math.max(Date.now(),clock.current+1,Date.parse(queued.value.publishedAt)||0);
  clock.current=publishedAtMs;
  const next={...queued.value,publishedAt:new Date(publishedAtMs).toISOString()};
  const operation=queue.current.then(async()=>{
   const persisted=buildPersistedMapPublication(latest.current,next,queued.fields);
    await saveCampaignDocument(target,KEY,persisted);
    if(scope.current===target){latest.current=persisted;setActiveScene(persisted);}
  });
  queue.current=operation.catch(()=>{});
  return operation;
  },[campaignId,owner,send]);
 useEffect(()=>{
  const onVisibilityChange=()=>{if(document.visibilityState==='visible')void flushPending();};
  document.addEventListener('visibilitychange',onVisibilityChange);
  return()=>document.removeEventListener('visibilitychange',onVisibilityChange);
 },[flushPending]);
 const publish=useCallback(async(value:ActiveScenePublication)=>{
  await flushPending();
   if(!owner||!campaignId||scope.current!==campaignId)return;
  const publishedAtMs=Math.max(Date.now(),clock.current+1,Date.parse(value.publishedAt)||0);
  clock.current=publishedAtMs;
  await commit(campaignId,{...value,publishedAt:new Date(publishedAtMs).toISOString()});
  },[campaignId,commit,flushPending,owner]);
 const publishMapPatch=useCallback(async(value:ActiveScenePublication,fields:ActiveSceneMapFields)=>{
   if(!owner||!campaignId||scope.current!==campaignId)return;
  const merged=mergePendingMapPublication(pending.current,value,fields);
  if(merged===null)void flushPending();
  pending.current=merged??{value,fields};
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>{timer.current=null;void flushPending();},100);
  },[campaignId,flushPending,owner]);
 const clear=useCallback(async()=>{
   if(!owner||!campaignId)return;
  const target=campaignId;
  if(timer.current){clearTimeout(timer.current);timer.current=null;}
  pending.current=null;
  const operation=queue.current.then(()=>deleteCampaignDocument(target,KEY));
  queue.current=operation.catch(()=>{});
  await operation;
  if(scope.current===target){latest.current=null;setActiveScene(null);}
  },[campaignId,owner,send]);
 useEffect(()=>{
  if(!owner||!channelReady||loading)return;
  void send('active_scene_change',{activeScene});
 },[activeScene,channelReady,loading,owner,send]);
 return {activeScene,loading,channelReady,publish,publishMapPatch,clear};
}
