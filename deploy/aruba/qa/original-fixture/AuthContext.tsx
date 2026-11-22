import {createContext,useContext} from 'react';
import {supabase} from './supabaseClient';

const user={id:'4a3465ec-47d7-4021-9f0d-e70da8cbd001',email:'gm@example.invalid',displayName:'GM prova',role:'standard' as const};
const session={access_token:'fixture-token-never-sent',token_type:'bearer',expires_in:3600,expires_at:4102444800,refresh_token:'fixture-refresh',user:{id:user.id,email:user.email,app_metadata:{},user_metadata:{display_name:user.displayName},aud:'authenticated',created_at:'2026-11-15T12:00:00.000Z'}} as any;
const value={user,session,isLoading:false,isAdmin:false,isPasswordRecovery:false,signIn:async()=>({error:null}),signUp:async()=>({error:null}),signOut:async()=>{},clearPasswordRecovery:()=>{},refreshUser:async()=>{}};
const Context=createContext(value);
export const USER_ROLE_LABELS={admin:'Amministratore',standard:'Utente Standard'};
export {supabase};
export function AuthProvider({children}:{children:React.ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export function useAuth(){return useContext(Context);}
