import { supabase } from '../../lib/supabaseClient';
import { persistenceOwner, selectedContentMode, type ContentMode } from './persistenceMode';
import { withLocalContent } from './localContentStore';

export async function uploadContentAsset(bucket: string, path: string, blob: Blob, options: { upsert?: boolean; contentType?: string } = {}) {
  const owner = persistenceOwner();
  if (selectedContentMode() === 'local') {
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    await withLocalContent(owner, true, (tables) => {
      const assets = tables._assets ??= [];
      const existing = assets.find((row) => row.id === `${bucket}/${path}`);
      if (existing && !options.upsert) throw new Error('Immagine già esistente');
      if (existing) existing.data_url = url;
      else assets.push({ id: `${bucket}/${path}`, data_url: url });
    });
    return { publicUrl: url, assetPath: path };
  }
  if (!supabase) throw new Error('Supabase non disponibile');
  const { error } = await supabase.storage.from(bucket).upload(path, blob, options);
  if (error) throw error;
  return { publicUrl: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, assetPath: path };
}

/** Legge un asset caricato in Locale (data-URL in IndexedDB). Usato per gli
 allegati chat, dove la modalita' in cui il file e' stato caricato (payload.
 storage) puo' differire dalla modalita' corrente: qui si legge sempre il
 negozio locale. Ritorna null se il file non c'e' piu'. */
export async function loadContentAssetDataUrl(bucket: string, path: string): Promise<string | null> {
  const owner = persistenceOwner();
  return (await withLocalContent(owner, false, (tables) =>
    (tables._assets ?? []).find((row) => row.id === `${bucket}/${path}`)?.data_url ?? null
  )) ?? null;
}

/** Rimuove un asset. `mode` (opzionale) forza il negozio da svuotare:
 senza, si segue la modalita' di salvataggio corrente come prima. */
export async function removeContentAsset(bucket: string, path: string, mode?: ContentMode): Promise<void> {
  const owner = persistenceOwner();
  if ((mode ?? selectedContentMode()) === 'local') {
    await withLocalContent(owner, true, (tables) => { tables._assets = (tables._assets ?? []).filter((row) => row.id !== `${bucket}/${path}`); });
    return;
  }
  if (!supabase) throw new Error('Supabase non disponibile');
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
