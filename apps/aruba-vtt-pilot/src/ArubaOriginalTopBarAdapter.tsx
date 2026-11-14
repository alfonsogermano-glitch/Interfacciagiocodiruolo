import {createContext,useContext,type ReactNode} from 'react';
/** QA-only adapters to mount the EXACT original TopBar without its historical
 * Supabase services. No backend is invented; unsupported notification and
 * character-claim writes fail explicitly and map operations stay unavailable. */
export type TopBarQaUser={id:string;email:string;displayName:string;role:'standard'|'admin'};
const Context=createContext<TopBarQaUser|null>(null);
export function ArubaTopBarQaIdentity({user,children}:{user:TopBarQaUser;children:ReactNode}){
 return <Context.Provider value={user}>{children}</Context.Provider>;
}
export function useAuth(){return {user:useContext(Context),session:null};}
export type NotificationRow={
 id:string;type:string;data:Record<string,unknown>;read:boolean;created_at:string;
};
export function useNotifications(){
 return {notifications:[] as NotificationRow[],unreadCount:0,
  markAllAsRead:async()=>{throw Error('Notifiche Aruba non abilitate');},
  markAsRead:async(_id:string)=>{throw Error('Notifiche Aruba non abilitate');},
  respondToInvite:async(_id:string,_action:'accept'|'decline'):Promise<{campaignId?:string}>=>{
   throw Error('Inviti Aruba non abilitati');
  }};
}
export function useCampaign(){
 return {refreshJoinedCampaigns:async()=>{throw Error('Inviti Aruba non abilitati');}};
}
export const projectId='disabled';
export const publicAnonKey='';
export async function loadCharactersByOwner(){throw Error('Funzione Supabase non disponibile su Aruba');}
export async function loadAvailableCharactersForInvite(){throw Error('Funzione Supabase non disponibile su Aruba');}
export async function assignCharacterToCampaign(){throw Error('Funzione Supabase non disponibile su Aruba');}
export async function claimCharacter(){throw Error('Funzione Supabase non disponibile su Aruba');}
