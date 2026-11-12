import type {ReactNode} from 'react';
/** Explicit staging-only adapters for missing services. These imports may
 * not initialize the original Supabase client, realtime or storage APIs.
 * The original detail component is rendered ONLY for HSC characters. */
export const loadNPCs=async()=>[];
export const loadChapters=async()=>[];
export const loadCharacters=async()=>[];
export const loadEnvironmentReferences=async()=>[];
export type EntityReference={id:string;name:string;campaignId:string|null};
export function useRuleset(){return {isHSC:true,isDnD5e:false,isPathfinder:false};}
export function EntityImageTab(){
 return <section role="status" className="aruba-entity-unmigrated">
  <h2>Immagine e Avatar non ancora disponibili</h2>
  <p>L'editor originale richiede l'archivio delle immagini Aruba. Non è attivo alcun caricamento sul vecchio storage.</p>
 </section>;
}
export function EntityImageExtras(){return null;}
export function RichTextEditor(){
 return <p role="status">Le note avanzate sono disabilitate finché i relativi dati non saranno migrati su Aruba.</p>;
}
export function FreschezzaMaxEditor(){return null;}
export function MonsterFreschezzaBoxesEditor(){return null;}
export function CatalogSelectionBlock(){return null;}
export function CustomEntriesEditor(){return null;}
export const TERRIFYING_TRAIT_ID='terrifying';
export const FOLLIA_DIFFICULTY_OPTIONS=[] as string[];
export const getMonsterCriticalBoxes=()=>[];
export const clampMonsterAudacia=(v:number)=>v;
export const normalizeTiroFollia=(v:unknown)=>v;
export const generateMonsterEntryId=()=>crypto.randomUUID();
export const calculateAudaciaGainFromFreshnessChange=()=>0;
export const monsterHasSpecialActions=()=>false;
export const MONSTER_TRAITS_CATALOG=[] as unknown[];
export const MONSTER_SPECIAL_ACTIONS_CATALOG=[] as unknown[];
