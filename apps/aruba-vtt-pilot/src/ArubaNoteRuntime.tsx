/**
 * Capability boundary for original TipTap tools that previously used
 * Supabase identity, custom dice library, and multiplayer sessions.
 * The original editor is preserved, but no remote legacy connection starts.
 */
export function useAuth(){return {user:null};}
export function useCampaign(){return {activeCampaign:null};}
export const CUSTOM_DICE_LIBRARY_CHANGED_EVENT='aruba-note-custom-dice-disabled';
export async function loadCustomDice(){return [];}
export function useOptionalDiceSession(){return null;}

/** Uploading note images is disabled until the native Aruba storage API
 * exists. Font, icon and local text controls still use original editor. */
export const supabase=null;
export const isSupabaseConfigured=false;
export async function uploadContentAsset(){throw Error('Caricamento immagini non ancora disponibile su Aruba');}
