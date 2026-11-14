import {useEffect,useRef,useState} from 'react';
import {createAuthorizedSceneSession} from './authorized-scene-session.mjs';
/** Explicit GM-only opt-in. This transport is intentionally separate from
 * the original scene renderer until the original map/editor is migrated. */
export function ArubaGmLiveScene({bootstrap,campaign}){
 const session=useRef(null);
 const [state,setState]=useState('idle');
 const [error,setError]=useState('');
 const [scene,setScene]=useState(null);
 const generation=useRef(0);
 useEffect(()=>()=>{
  generation.current++;
  session.current?.close();session.current=null;
 },[campaign.id]);
 function stop(){
  generation.current++;
  const previous=session.current;session.current=null;
  previous?.close();setState('idle');setScene(null);setError('');
 }
 function start(){
  if(session.current)return;
  // The UI is GM-only; reject an accidental player mount before opening sockets.
  if(campaign.ownerId!==bootstrap.id){setError('Connessione GM non autorizzata');return;}
  const attempt=++generation.current;
  setError('');setScene(null);
  try{
   // Temporary one-scene-per-campaign identifier, never persisted as a real map.
   const active=createAuthorizedSceneSession({bootstrap,campaign,sceneId:campaign.id,
    origin:window.location.origin,WebSocketImpl:window.WebSocket,
    PeerConnectionImpl:window.RTCPeerConnection,
    onStatus:event=>{if(generation.current===attempt)setState(event.state);},
    onScene:value=>{if(generation.current===attempt)setScene(value);}});
   session.current=active;setState('connecting');
  }catch(e){if(generation.current===attempt){setError(e instanceof Error?e.message:'Connessione non disponibile');setState('idle');}}
 }
 return <section className="selected-campaign" aria-label="Sessione multiplayer GM">
  <div className="overline">CONNESSIONE MULTIPLAYER · GM</div>
  <p className="muted">Connessione sperimentale autorizzata. La mappa originale e i suoi strumenti non sono ancora collegati.</p>
  <p role="status">Stato: {state}</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {scene&&<p className="muted">Scena di prova: {scene.tokens?.length??0} token</p>}
  {session.current?<button type="button" onClick={stop}>Chiudi connessione</button>:
   <button type="button" onClick={start}>Apri connessione GM</button>}
 </section>;
}
