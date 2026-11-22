import {useSyncExternalStore} from 'react';
import {rollDiceFormula} from '../../../src/app/components/session/dice/diceEngine';
import type {RollResult} from '../../../src/app/components/session/dice/diceTypes';
import {saveRollEntry} from './ArubaChatService';
let rolls:RollResult[]=[];const listeners=new Set<()=>void>();const emit=()=>listeners.forEach(fn=>fn());
export function publishArubaRoll(roll:RollResult){rolls=[roll,...rolls.filter(item=>item.id!==roll.id)].slice(0,100);emit();}
export function clearArubaRolls(){rolls=[];emit();}
export function useDiceSession(){
 const current=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>rolls,()=>rolls);
 return {rolls:current,clearLocalHistory:clearArubaRolls,removeRoll:(id:string)=>{rolls=rolls.filter(item=>item.id!==id);emit();},rerollResult:(source:RollResult)=>{if(source.origin==='modifier')return;const next=rollDiceFormula({identity:{campaignId:source.campaignId,rollerId:source.rollerId,rollerName:source.rollerName,rollerAvatarUrl:source.rollerAvatarUrl},request:{items:source.sourceItems,formulaId:source.formulaId,formulaName:source.formulaName,formulaIconName:source.formulaIconName,visibility:source.visibility}});publishArubaRoll(next);void saveRollEntry(next);}};
}
