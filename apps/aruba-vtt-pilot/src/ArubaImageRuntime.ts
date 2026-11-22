// Inert runtime for the ORIGINAL EntityImageExtras component.
// The component is reused verbatim, but its legacy Supabase upload path is
// unreachable: isSupabaseConfigured=false makes the cover file fall back to
// the controlled Aruba adapter in ArubaCharacterImageEditor. No Supabase
// client, auth context, realtime channel or legacy storage is initialized.
export const isSupabaseConfigured = false;
export const supabase = null;
export function useAuth() {
  return { user: null };
}
export async function uploadContentAsset(): Promise<{ publicUrl: string }> {
  throw new Error('Archivio immagini legacy disabilitato su Aruba');
}
