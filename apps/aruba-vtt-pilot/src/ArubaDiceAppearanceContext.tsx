import {useMemo,type ReactNode} from 'react';
import {buildDefaultStandardDiceStyles,getStandardDieAppearance} from '../../../src/app/components/session/dice/diceAppearance';
import type {StandardDieAppearance,StandardDieSides} from '../../../src/app/components/session/dice/diceTypes';
type Value={styles:StandardDieAppearance[];isLoading:boolean;getStandardAppearance:(sides:StandardDieSides)=>StandardDieAppearance;saveStyles:(styles:readonly StandardDieAppearance[])=>Promise<StandardDieAppearance[]>};
export function DiceAppearanceProvider({children}:{children:ReactNode}){return children;}
export function useDiceAppearance(){
 return useMemo<Value>(()=>{const styles=buildDefaultStandardDiceStyles();return {styles,isLoading:false,getStandardAppearance:(sides)=>getStandardDieAppearance(styles,sides)??styles.find(item=>item.sides===sides)!,saveStyles:async()=>{throw new Error('Personalizzazione dadi non disponibile nel runtime Aruba.');}}},[]);
}
