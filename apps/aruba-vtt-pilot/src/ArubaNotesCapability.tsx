import {createContext,useContext,type ReactNode,type ComponentProps} from 'react';
import {EntityTabBar} from '../../../src/app/components/session/shared/EntityTabBar';
/**
 * Aruba notes are opt-in twice: server capability and UI provider.
 * The original tab bar is preserved, but editable note operations stay
 * hidden until the authenticated API confirms the feature is enabled.
 */
const Context=createContext(false);
export function ArubaNotesProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 return <Context.Provider value={enabled}>{children}</Context.Provider>;
}
export const useArubaNotesEnabled=()=>useContext(Context);
export function ArubaEntityTabBar(props:ComponentProps<typeof EntityTabBar>){
 const enabled=useArubaNotesEnabled();
 return <EntityTabBar {...props} canEdit={enabled&&props.canEdit}/>;
}
