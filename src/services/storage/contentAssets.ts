import { supabase } from '../../lib/supabaseClient';
import { persistenceOwner, selectedContentMode } from './persistenceMode';
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

export async function removeContentAsset(bucket: string, path: string): Promise<void> {
  const owner = persistenceOwner();
  if (selectedContentMode() === 'local') {
    await withLocalContent(owner, true, (tables) => { tables._assets = (tables._assets ?? []).filter((row) => row.id !== `${bucket}/${path}`); });
    return;
  }
  if (!supabase) throw new Error('Supabase non disponibile');
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
