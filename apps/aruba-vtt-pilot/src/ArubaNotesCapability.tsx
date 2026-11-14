import {createContext,useContext,type ReactNode,type ComponentProps} from 'react';
import {EntityTabBar} from '../../../src/app/components/session/shared/EntityTabBar';
/**
 * Aruba notes are opt-in twice: server capability and UI provider.
 * The original tab bar is preserved, but editable note operations stay
 * hidden until the authenticated API confirms the feature is enabled.
 */
type NotesContext={enabled:boolean;campaignId:string|null;characterId:string|null};
const Context=createContext<NotesContext>({enabled:false,campaignId:null,characterId:null});
export function ArubaNotesProvider({enabled,campaignId,characterId,children}:{enabled:boolean;campaignId:string;characterId:string;children:ReactNode}){
 return <Context.Provider value={{enabled,campaignId,characterId}}>{children}</Context.Provider>;
}
export const useArubaNotesEnabled=()=>useContext(Context).enabled;
export const useArubaNotesContext=()=>useContext(Context);
export function ArubaEntityTabBar(props:ComponentProps<typeof EntityTabBar>){
 const enabled=useArubaNotesEnabled();
 return <EntityTabBar {...props} canEdit={enabled&&props.canEdit}/>;
}
