import {projectActiveScene,validateActiveScenePublication} from './active-scene-wire.mjs';
// VTT transport contract v1 — isolated laboratory state, NOT real campaign storage.
// All mutation decisions occur on the GM-hosted server, never on a player client.
const VERSION=1;
const CAMPAIGN='demo';
const MAX_SEEN=2000;
const cleanId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,72}$/.test(value);
const bounded=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max;
const coord=x=>Number.isInteger(x)&&x>=0&&x<=10000;
const emit=(socket,frame)=>{if(socket?.readyState===1)socket.send(JSON.stringify(frame))};
const safeScene=(scene,role)=>scene?role==='gm'?{...scene}:{sceneId:scene.sceneId,title:scene.title}:null;

export function createVttProtocol(){
 const peers=new Map(),seen=new Map();
 let sequence=0,scene=null,activeScene=null;
 const tokens=new Map();
 const view=role=>({
  scene:safeScene(scene,role),
  activeScene:activeScene?projectActiveScene(activeScene,role):null,
  tokens:[...tokens.values()].map(t=>({tokenId:t.tokenId,owner:t.owner,x:t.x,y:t.y}))
 });
 function snapshot(socket){
  const peer=peers.get(socket);
  if(!peer)return;
  emit(socket,{type:'vtt:snapshot',version:VERSION,campaignId:CAMPAIGN,sequence,state:view(peer.role)});
 }
 function join(socket,{role,actorId}){
  if(!['gm','player'].includes(role)||!cleanId(actorId)||peers.has(socket))return false;
  peers.set(socket,{role,actorId});
  snapshot(socket);
  return true;
 }
 const leave=socket=>{peers.delete(socket)};
 const ack=(socket,eventId,status,code)=>emit(socket,{type:'vtt:ack',version:VERSION,campaignId:CAMPAIGN,eventId,status,sequence,...(code?{code}:{})});
 const err=(socket,code)=>emit(socket,{type:'vtt:error',version:VERSION,campaignId:CAMPAIGN,code});
 function handle(socket,msg){
  if(!msg||typeof msg!=='object'||typeof msg.type!=='string'||!msg.type.startsWith('vtt:'))return false;
  const actor=peers.get(socket);
  if(!actor){err(socket,'unauthenticated');return true}
  if(msg.version!==VERSION){err(socket,'version_unsupported');return true}
  if(msg.campaignId!==CAMPAIGN){err(socket,'campaign_mismatch');return true}
  if(msg.type==='vtt:resync'){
   if(!Number.isSafeInteger(msg.lastSequence)||msg.lastSequence<0){err(socket,'invalid_sequence');return true}
   snapshot(socket);return true;
  }
  if(msg.type!=='vtt:command'){err(socket,'invalid_frame');return true}
  const {eventId,command,payload}=msg;
  if(!cleanId(eventId)){err(socket,'invalid_event_id');return true}
  const dedupeKey=actor.actorId+':'+eventId;
  if(seen.has(dedupeKey)){ack(socket,eventId,'duplicate');return true}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)){ack(socket,eventId,'rejected','invalid_payload');return true}
  let changes,code;
  if(command==='publishScene'){
   if(actor.role!=='gm')code='gm_only';
   else if(!cleanId(payload.sceneId)||!bounded(payload.title,120)||
       (payload.gmNotes!==undefined&&typeof payload.gmNotes!=='string')||
       (payload.gmNotes?.length??0)>2000)code='invalid_scene';
   else{
    scene={sceneId:payload.sceneId,title:payload.title,gmNotes:payload.gmNotes??''};
    changes={scene};
   }
  }else if(command==='publishActiveScene'){
   if(actor.role!=='gm')code='gm_only';
   else if(!validateActiveScenePublication(payload.activeScene)||payload.activeScene.campaignId!==CAMPAIGN)code='invalid_active_scene';
   else{
    activeScene=projectActiveScene(payload.activeScene,'gm');
    changes={activeScene};
   }
  }else if(command==='assignToken'){
   if(actor.role!=='gm')code='gm_only';
   else if(!cleanId(payload.tokenId)||!cleanId(payload.owner)||
       !coord(payload.x)||!coord(payload.y)||tokens.size>=100&& !tokens.has(payload.tokenId))code='invalid_token';
   else{
    const token={tokenId:payload.tokenId,owner:payload.owner,x:payload.x,y:payload.y};
    tokens.set(token.tokenId,token);changes={token};
   }
  }else if(command==='moveToken'){
   const token=tokens.get(payload.tokenId);
   if(!token)code='unknown_token';
   else if(actor.role!=='gm'&&token.owner!==actor.actorId)code='forbidden';
   else if(!coord(payload.x)||!coord(payload.y))code='invalid_coordinates';
   else{
    const updated={...token,x:payload.x,y:payload.y};
    tokens.set(token.tokenId,updated);changes={token:updated};
   }
  }else code='unknown_command';
  if(code){ack(socket,eventId,'rejected',code);return true}
  sequence++;
  seen.set(dedupeKey,sequence);
  if(seen.size>MAX_SEEN)seen.delete(seen.keys().next().value);
  ack(socket,eventId,'accepted');
  for(const [other,peer] of peers){
   const cleanChanges={...changes};
   if(changes.scene)cleanChanges.scene=safeScene(changes.scene,peer.role);
   if(changes.activeScene)cleanChanges.activeScene=projectActiveScene(changes.activeScene,peer.role);
   emit(other,{type:'vtt:patch',version:VERSION,campaignId:CAMPAIGN,eventId,actorId:actor.actorId,sequence,changes:cleanChanges});
  }
  return true;
 }
 return {join,leave,handle,snapshot,get sequence(){return sequence}};
}
