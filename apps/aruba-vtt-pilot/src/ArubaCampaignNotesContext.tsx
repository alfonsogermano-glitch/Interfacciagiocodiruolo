import {createContext,useContext,type ReactNode} from 'react';
export type CampaignNotesIdentity={
 enabled:boolean;campaignId:string|null;userId:string|null;isGm:boolean;ownerId?:string|null;
};
const context=createContext<CampaignNotesIdentity>({enabled:false,campaignId:null,userId:null,isGm:false,ownerId:null});
export const useArubaCampaignNotesContext=()=>useContext(context);
export function ArubaCampaignNotesProvider({enabled,campaignId,userId,isGm,ownerId=null,children}:{
 enabled:boolean;campaignId:string|null;userId:string|null;isGm:boolean;ownerId?:string|null;children:ReactNode;
}){
 return <context.Provider value={{enabled,campaignId,userId,isGm,ownerId}}>{children}</context.Provider>;
}
// This is used only by the ORIGINAL NoteListRow, whose auth session
// pointer historically gates the duplicate menu. No bearer is transmitted.
export function useAuth(){
 const {enabled,userId}=useArubaCampaignNotesContext();
 return {user:enabled&&userId?{id:userId}:null,
  session:enabled&&userId?{access_token:'aruba-cookie-session'}:null};
}
