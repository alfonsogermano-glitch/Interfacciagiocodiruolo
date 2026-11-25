import {createContext,useContext,useState,type ReactNode} from 'react';
import {Toaster,toast} from 'sonner';
import {SlideOverPanel} from '../../../src/app/components/session/SlideOverPanel';
import {SessionDicePanel} from '../../../src/app/components/session/dice/SessionDicePanel';
import {DiceRollHistoryDrawer} from '../../../src/app/components/session/dice/DiceRollHistoryDrawer';
import {rollDiceFormula} from '../../../src/app/components/session/dice/diceEngine';
import {attachDiceAppearanceSnapshots} from '../../../src/app/components/session/dice/diceAppearance';
import type {DiceRollRequest,RollResult} from '../../../src/app/components/session/dice/diceTypes';
import {useDiceAppearance} from './ArubaDiceAppearanceContext';
import {ArubaDice3D} from './ArubaDice3D';
import {publishArubaRoll} from './ArubaChatDiceSession';
import {saveRollEntry} from './ArubaChatService';

type Identity={id:string;displayName:string};
type Campaign={id:string;ownerId:string;name:string;ruleset:string};
const Scope=createContext<{user:Identity;campaign:Campaign}|null>(null);
type Session={
 rolls:RollResult[];submitLocalRoll:(request:DiceRollRequest)=>RollResult;
 reroll:(id:string)=>RollResult|null;rerollResult:(result:RollResult)=>RollResult|null;
 clearLocalHistory:()=>void;removeRoll:(id:string)=>void;
 historyOpen:boolean;historyUnread:boolean;openHistory:()=>void;closeHistory:()=>void;
 animationsEnabled:boolean;setAnimationsEnabled:(enabled:boolean)=>void;
 setAnimationContainer:(_node:HTMLElement|null)=>void;
};
const SessionContext=createContext<Session|null>(null);
export function useAuth(){const scope=useContext(Scope);return {user:scope?.user??null,session:null};}
export function useCampaign(){const scope=useContext(Scope);return {activeCampaign:scope?.campaign??null,activeCampaignId:scope?.campaign.id??null};}
export function useDiceSession(){const session=useContext(SessionContext);if(!session)throw Error('Contesto dadi Aruba mancante');return session;}
export const useOptionalDiceSession=()=>useContext(SessionContext);
// The original history drawer mounts this slot. Animation is owned below,
// using the same computed result rather than a second dice provider.
export function Dice3DOverlay(){return null;}
export function ArubaDiceToolsProvider({user,campaign,chatEnabled,children}:{
 user:Identity;campaign:Campaign;chatEnabled:boolean;children:ReactNode;
}){
 const [rolls,setRolls]=useState<RollResult[]>([]);
 const [historyOpen,setHistoryOpen]=useState(false),[historyUnread,setUnread]=useState(false);
 const [animationsEnabled,setAnimationsEnabled]=useState(true);
 const [animation,setAnimation]=useState<RollResult|null>(null);
 const {styles}=useDiceAppearance();
 const submitLocalRoll=(request:DiceRollRequest)=>{
  const result=attachDiceAppearanceSnapshots(rollDiceFormula({
   identity:{campaignId:campaign.id,rollerId:user.id,rollerName:user.displayName},request,
  }),styles);
  setRolls(current=>[result,...current].slice(0,100));publishArubaRoll(result);
  if(!historyOpen)setUnread(true);
  if(animationsEnabled)setAnimation(result);
  // Until the private GM transport is implemented, secret rolls stay local.
  if(chatEnabled&&result.visibility==='public')void saveRollEntry(result)
   .catch(()=>toast.error('Tiro calcolato; invio alla chat non riuscito.'));
  return result;
 };
 const rerollResult=(previous:RollResult)=>{
  if(previous.campaignId!==campaign.id||previous.rollerId!==user.id||previous.origin==='modifier')return null;
  return submitLocalRoll({items:previous.sourceItems,formulaName:previous.formulaName,
   formulaId:previous.formulaId,formulaIconName:previous.formulaIconName,visibility:previous.visibility});
 };
 return <Scope.Provider value={{user,campaign}}><SessionContext.Provider value={{
  rolls,submitLocalRoll,rerollResult,reroll:id=>{const r=rolls.find(r=>r.id===id);return r?rerollResult(r):null;},
  removeRoll:id=>setRolls(current=>current.filter(r=>r.id!==id)),clearLocalHistory:()=>setRolls([]),
  historyOpen,historyUnread,openHistory:()=>{setHistoryOpen(true);setUnread(false);},
  closeHistory:()=>setHistoryOpen(false),animationsEnabled,
  setAnimationsEnabled:enabled=>{setAnimationsEnabled(enabled);if(!enabled)setAnimation(null);},
  setAnimationContainer:()=>{},
 }}>
  {children}
  {animation&&animationsEnabled&&<ArubaDice3D key={animation.id} result={animation}/>}
  <Toaster theme="dark"/>
 </SessionContext.Provider></Scope.Provider>;
}
export function ArubaOriginalDiceFloating(){return <DiceRollHistoryDrawer/>;}
export function ArubaOriginalDicePanel({onClose,enabled}:{onClose:()=>void;enabled:boolean}){
 return <section aria-label="Libreria dadi della campagna">
  <SlideOverPanel isOpen onClose={onClose} rightOffset="5rem" widthClassName="max-w-none"
   panelWidth={Math.max(320,Math.min(1024,window.innerWidth-180))}>
   <p className="muted" role="status">Cartelle e dadi Custom non sono ancora disponibili; i tiri segreti restano solo in questo browser.</p>
   {enabled?<SessionDicePanel/>:<p role="status">La libreria formule non è autorizzata. Il tiro rapido resta disponibile.</p>}
  </SlideOverPanel>
 </section>;
}
