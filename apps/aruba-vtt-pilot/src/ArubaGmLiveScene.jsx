import {useEffect,useRef,useState} from 'react';
import {createArubaWebRtcSignalingClient} from './ArubaWebRtcSignalingClient.mjs';
import {createVerifiedGmCampaignChannelBinding} from './ArubaVerifiedGmCampaignChannelBinding.mjs';
import {createVerifiedPlayerCampaignChannelBinding} from './ArubaVerifiedPlayerCampaignChannelBinding.mjs';
import {createArubaVerifiedGmMapDispatch} from './ArubaVerifiedGmMapDispatch.mjs';
import {getGmWorkspaceRuntime} from './ArubaGmWorkspaceRuntime.mjs';
import {projectOriginalMapForPlayer} from './ArubaOriginalMapRevisionProjection.mjs';

// Shared non-map traffic is safe to relay without inspecting private map state.
// Map requests remain denied until SessionWorkspace supplies its current-state
// dispatcher; authoritative map output remains denied until projection exists.
const SHARED_EVENTS=new Set(['dice_roll','chat_message','chat_reaction','chat_delete','map_measurement']);
function visibleSceneEvent(campaignId,event,payload){
 if(event!=='active_scene_change'||!payload||typeof payload!=='object'||Array.isArray(payload))return false;
 const scene=payload.activeScene;
 if(scene===null)return true;
 if(!scene||typeof scene!=='object'||Array.isArray(scene)||scene.campaignId!==campaignId)return false;
 try{
  const visible=projectOriginalMapForPlayer(scene);
  return ['mapTokens','mapDrawings','mapPois','mapFog','mapObjectOrder']
   .every(key=>JSON.stringify(scene[key]??[])===JSON.stringify(visible[key]??[]));
 }catch{return false;}
}

/** Explicit membership-scoped opt-in using the verified WSS/WebRTC client. */
export function ArubaGmLiveScene({bootstrap,campaign,active,visible=true,onChannelReady=()=>{}}){
 const session=useRef(null);
 const [state,setState]=useState('idle');
 const [error,setError]=useState('');
 const generation=useRef(0);
 const membership=bootstrap.campaignMemberships?.find(member=>member.userId===bootstrap.id&&member.campaignId===campaign.id);
 const expectedRole=campaign.ownerId===bootstrap.id?'gm':'player';
 const authorized=membership?.role===expectedRole;
 const roleLabel=expectedRole==='gm'?'GM':'GIOCATORE';
 useEffect(()=>()=>{
  generation.current++;
  session.current?.close();session.current=null;onChannelReady(false);
 },[campaign.id]);
 function stop(){
  generation.current++;
  const previous=session.current;session.current=null;
   previous?.close();onChannelReady(false);setState('idle');setError('');
 }
 function start(){
  if(session.current)return;
  // Never infer a role from the selected route: require the server bootstrap row.
  if(!authorized){setError('Connessione multiplayer non autorizzata');return;}
  const attempt=++generation.current;
   setError('');
   try{
    let binding=null;
    const reportError=value=>{if(generation.current===attempt){setError(value instanceof Error?value.message:'Connessione non disponibile');}};
    const client=createArubaWebRtcSignalingClient({campaignId:campaign.id,
     role:expectedRole==='gm'?'host':'player',origin:window.location.origin,
     WebSocketCtor:window.WebSocket,PeerConnectionCtor:window.RTCPeerConnection,
     onState:event=>{if(generation.current===attempt){setState(event.state);
      if(['disconnected','connection-error'].includes(event.state)||(expectedRole==='player'&&['peer-left','peer-failed'].includes(event.state)))onChannelReady(false);
     }},onError:reportError,
     onVerifiedPeer:proof=>binding?.onVerifiedPeer(proof),
     onPeerRevoked:proof=>{binding?.onPeerRevoked(proof);onChannelReady(expectedRole==='gm'&&binding?.attachedCount>0);},
     onDataChannel:({peerId,channel})=>{
      if(generation.current!==attempt){channel.close();return;}
      if(expectedRole==='gm'){
       if(!binding?.attachChannel(peerId,channel)){channel.close();return;}onChannelReady(true);
       const current=getGmWorkspaceRuntime(campaign.id)?.getCurrentMapContext();
       if(current?.state)try{
        const projected=projectOriginalMapForPlayer(current.state);
        binding.publishHostEvent('active_scene_change',{activeScene:{...current.state,...projected}});
       }catch(error){reportError(error);}
       return;
      }
      if(binding){channel.close();return;}
      try{binding=createVerifiedPlayerCampaignChannelBinding({campaignId:campaign.id,
       userId:bootstrap.id,ownerId:campaign.ownerId,channel,onError:reportError,onClosed:()=>onChannelReady(false)});}
      catch(error){channel.close();reportError(error);}
      if(binding)onChannelReady(true);
     },
    });
    if(expectedRole==='gm'){
     let workspace=null,dispatcher=null;
     const mapDispatcher=()=>{
      const current=getGmWorkspaceRuntime(campaign.id);
      if(current===workspace)return dispatcher;
      dispatcher?.close();workspace=current;
      dispatcher=current?createArubaVerifiedGmMapDispatch({campaignId:campaign.id,gmUserId:bootstrap.id,
       getCurrentMapContext:current.getCurrentMapContext,
       isVerifiedMember:({userId})=>binding?.hasAttachedUser(userId)===true,
       onTokenAction:current.onTokenAction,onPoiAction:current.onPoiAction,onLayerAction:current.onLayerAction,
       onError:reportError}):null;
      return dispatcher;
     };
     binding=createVerifiedGmCampaignChannelBinding({
     campaignId:campaign.id,gmUserId:bootstrap.id,onError:reportError,
     authorizePlayerEvent:args=>SHARED_EVENTS.has(args.event)||mapDispatcher()?.authorizePlayerEvent(args)===true,
     authorizeHostEvent:({event,payload})=>SHARED_EVENTS.has(event)||visibleSceneEvent(campaign.id,event,payload),
     receivePlayerEvent:(message,runtime)=>SHARED_EVENTS.has(message.event)
      ?runtime.receive(message.event,message.payload)
      :mapDispatcher()?.receiveFromPlayer(message)===true,
    });
    }
    const transport={close(){client.disconnect();binding?.close();binding=null;}};
    session.current=transport;setState('connecting');
    void client.connectWithTurn(window.fetch.bind(window)).catch(error=>{
     if(generation.current!==attempt)return;
     transport.close();if(session.current===transport)session.current=null;
     onChannelReady(false);setState('idle');reportError(error);
    });
   }catch(e){if(generation.current===attempt){setError(e instanceof Error?e.message:'Connessione non disponibile');setState('idle');}}
 }
 useEffect(()=>{
  if(active===true)start();
  if(active===false)stop();
 },[active,campaign.id]);
  if(!visible)return null;
  return <section className="selected-campaign" aria-label={`Sessione multiplayer ${roleLabel}`}>
   <div className="overline">CONNESSIONE MULTIPLAYER · {roleLabel}</div>
   <p className="muted">Canale multiplayer autorizzato. Le azioni mappa restano bloccate finché il workspace originale non è collegato.</p>
  <p role="status">Stato: {state}</p>
  {error&&<p className="error" role="alert">{error}</p>}
   {active===undefined&&(session.current?<button type="button" onClick={stop}>Chiudi connessione</button>:
     <button type="button" onClick={start}>Apri connessione {roleLabel.toLowerCase()}</button>)}
 </section>;
}
