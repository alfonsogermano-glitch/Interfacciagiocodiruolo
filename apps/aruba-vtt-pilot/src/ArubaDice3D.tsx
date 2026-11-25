import {useEffect,useRef,useState} from 'react';
import type {RollResult} from '../../../src/app/components/session/dice/diceTypes';
import type {Dice3DRenderer} from '../../../src/app/components/session/dice/dice3dTypes';

/** Presentation only: animate the already computed roll, never roll again or
 * contact a legacy service. Unmount revokes pending imports and animations. */
export function ArubaDice3D({result}:{result:RollResult}){
 const container=useRef<HTMLDivElement>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  let renderer:Dice3DRenderer|undefined;
  let clearTimer:ReturnType<typeof setTimeout>|undefined;
  void (async()=>{
   try{
    const {HollowgateDice3DRenderer}=await import('../../../src/app/components/session/dice/dice3dRenderer');
    if(controller.signal.aborted||!container.current)return;
    renderer=new HollowgateDice3DRenderer();
    await renderer.init(container.current);
    if(controller.signal.aborted){renderer.dispose();return;}
    await renderer.play(result,controller.signal);
    if(!controller.signal.aborted)clearTimer=setTimeout(()=>renderer?.clear(),2500);
   }catch{
    if(!controller.signal.aborted){renderer?.dispose();setError(true);}
   }
  })();
  return ()=>{controller.abort();clearTimeout(clearTimer);renderer?.dispose();};
 },[result]);
 return <>
  <div data-dice-3d-overlay aria-hidden="true"
   style={{position:'fixed',inset:0,zIndex:1050,pointerEvents:'none'}}>
   <div ref={container} style={{width:'100%',height:'100%'}}/>
  </div>
  {error&&<p role="status" className="aruba-dice-error">Animazione 3D non disponibile su questo dispositivo. Il risultato del tiro resta valido nello storico.</p>}
 </>;
}
