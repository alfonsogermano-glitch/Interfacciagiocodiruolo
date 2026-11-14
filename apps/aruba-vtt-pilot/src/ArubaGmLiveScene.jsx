import {useEffect,useRef,useState} from 'react';
import {createAuthorizedSceneSession} from './authorized-scene-session.mjs';
/** Explicit GM-only opt-in. This transport is intentionally separate from
 * the original scene renderer until the original map/editor is migrated. */
export function ArubaGmLiveScene({bootstrap,campaign}){
 const session=useRef(null);
 const [state,setState]=useState('idle');
 const [error,setError]=useState('');
 const [scene,setScene]=useState(null);
 useEffect(()=>()=>{session.current?.close();session.current=null;},[campaign.id]);
 function stop(){session.current?.close();session.current=null;setState('idle');setScene(null);}
 function start(){
  if(session.current)return;
  setError('');
  try{
   // Temporary one-scene-per-campaign identifier, never persisted as a real map.
   const active=createAuthorizedSceneSession({bootstrap,campaign,sceneId:campaign.id,
    origin:window.location.origin,WebSocketImpl:window.WebSocket,
    PeerConnectionImpl:window.RTCPeerConnection,
    onStatus:event=>setState(event.state),onScene:setScene});
   session.current=active;setState('connecting');
  }catch(e){setError(e instanceof Error?e.message:'Connessione non disponibile');setState('idle');}
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
