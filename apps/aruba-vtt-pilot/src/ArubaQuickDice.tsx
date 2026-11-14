import {useEffect,useState} from 'react';
import {DiceFiveIcon,ArrowDownIcon,ArrowUpIcon,XIcon} from '@phosphor-icons/react';
import {rollDiceFormula} from '../../../src/app/components/session/dice/diceEngine.ts';
import {
 addStandardQuickDie,buildQuickRollItems,clearQuickRoll,decrementQuickDie,
 type QuickRollEntry,
} from '../../../src/app/components/session/dice/diceQuickRollState.ts';
import type {RollResult} from '../../../src/app/components/session/dice/diceTypes.ts';

const SIDES=[4,6,8,10,12,20,100] as const;
const MAX_SELECTED=1000;

/** Real legacy game rule engine; private browser-session preview until host transport is ready.
 * No fabricated server history or shared roll announcements. */
export function ArubaQuickDice({campaignId,userId,rollerName}:{
 campaignId:string;userId:string;rollerName:string;
}){
 const [entries,setEntries]=useState<QuickRollEntry[]>([]);
 const [paletteOpen,setPaletteOpen]=useState(false);
 const [historyOpen,setHistoryOpen]=useState(false);
 const [unread,setUnread]=useState(false);
 const [history,setHistory]=useState<RollResult[]>([]);
 const [error,setError]=useState<string|null>(null);
 // Never show dice from a different campaign as part of this campaign.
 useEffect(()=>{
  setEntries([]);setHistory([]);setPaletteOpen(false);setHistoryOpen(false);setUnread(false);setError(null);
 },[campaignId,userId]);
 // The original session rail opens the existing quick-roll palette instead of
 // creating a second dice state. No shared/session dice are claimed yet.
 useEffect(()=>{
  const open=()=>{setPaletteOpen(true);setHistoryOpen(false);};
  window.addEventListener('hollowgate:aruba-open-dice',open);
  return ()=>window.removeEventListener('hollowgate:aruba-open-dice',open);
 },[]);
 const selected=entries.reduce((sum,entry)=>sum+entry.quantity,0);
 const add=(sides:number)=>{
  setEntries(current=>current.reduce((sum,item)=>sum+item.quantity,0)<MAX_SELECTED?
   addStandardQuickDie(current,sides):current);
 };
 const roll=()=>{
  if(selected===0)return;
  try{
   const result=rollDiceFormula({
    identity:{campaignId,rollerId:userId,rollerName},
    request:{items:buildQuickRollItems(entries,[]),formulaName:'',visibility:'public'},
   });
   setHistory(current=>[result,...current].slice(0,20));
   if(!historyOpen)setUnread(true);
   setEntries(clearQuickRoll());
   setPaletteOpen(false);
   setError(null);
  }catch(reason){setError(reason instanceof Error?reason.message:'Tiro non riuscito');}
 };
 return <div className="aruba-dice-floating" data-aruba-original-dice-engine>
   <button type="button" className="aruba-dice-history-toggle" aria-label={historyOpen?'Nascondi storico tiri':'Mostra storico tiri'}
     onClick={()=>{setHistoryOpen(current=>!current);setUnread(false);}}>
     {historyOpen?<ArrowDownIcon size={15}/>:<ArrowUpIcon size={15}/>}
     {unread&&!historyOpen&&<span className="aruba-dice-unread" aria-label="Nuovi tiri"/>}
   </button>
   <button type="button" className="aruba-dice-toggle" aria-label="Tiro rapido"
     aria-expanded={paletteOpen} onClick={()=>setPaletteOpen(current=>!current)}><DiceFiveIcon size={25} weight="duotone"/></button>
   {paletteOpen&&<div className="aruba-dice-palette" aria-label="Selezione dadi">
     <div className="aruba-dice-types">
       {SIDES.map(sides=>{
        const entry=entries.find(value=>value.kind==='dice'&&value.sides===sides);
        return <button key={sides} type="button" aria-label={`Aggiungi d${sides}`} onClick={()=>add(sides)}
         disabled={selected>=MAX_SELECTED}>d{sides}{entry&&<small>{entry.quantity}</small>}</button>;
       })}
     </div>
     <div className="aruba-dice-actions">
       <button type="button" className="secondary" onClick={()=>setEntries([])} disabled={!selected}>Pulisci</button>
       <button type="button" onClick={roll} disabled={!selected}>Tira ({selected})</button>
       <button type="button" aria-label="Chiudi selezione dadi" onClick={()=>setPaletteOpen(false)}><XIcon size={16}/></button>
     </div>
     {entries.length>0&&<div className="aruba-dice-selected">
       {entries.filter(e=>e.kind==='dice').map(entry=><button type="button" key={entry.sides} onClick={()=>setEntries(current=>decrementQuickDie(current,entry))} aria-label={`Rimuovi un d${entry.sides}`}>d{entry.sides} × {entry.quantity} −</button>)}
     </div>}
   </div>}
   {historyOpen&&<section className="aruba-dice-history" aria-label="Storico tiri locale">
     <div className="aruba-dice-history-head"><strong>Storico tiri</strong><button type="button" onClick={()=>setHistory([])}>Pulisci</button></div>
     <p>Solo in questo browser. La sincronizzazione con i giocatori non è ancora attiva.</p>
     {history.length===0?<p>Nessun tiro effettuato.</p>:<ol>{history.map(result=>
       <li key={result.id}><span>{result.formulaText} · {result.rollerName}</span><strong>{result.total??'—'}</strong></li>
     )}</ol>}
   </section>}
   {error&&<div className="aruba-dice-error" role="alert">{error}</div>}
 </div>;
}
