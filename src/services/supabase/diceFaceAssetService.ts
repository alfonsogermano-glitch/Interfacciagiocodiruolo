import { supabase } from '../../app/auth/AuthContext';
const BUCKET = 'dice-face-assets';
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const TARGET_SIZE = 512;

export async function normalizeDiceFaceImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Seleziona un file immagine.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('L’immagine non può superare 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(TARGET_SIZE / bitmap.width, TARGET_SIZE / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const dx = (TARGET_SIZE - drawWidth) / 2;
    const dy = (TARGET_SIZE - drawHeight) / 2;
    const canvas = document.createElement('canvas'); canvas.width = TARGET_SIZE; canvas.height = TARGET_SIZE;
    const context = canvas.getContext('2d'); if (!context) throw new Error('Impossibile preparare l’immagine.');
    context.clearRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    context.drawImage(bitmap, dx, dy, drawWidth, drawHeight);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
    if (!blob) throw new Error('Impossibile convertire l’immagine in WebP.');
    if (blob.size > 1024 * 1024) throw new Error('L’immagine normalizzata supera 1 MB.');
    return blob;
  } finally { bitmap.close(); }
}

export async function uploadDiceFaceAsset(input: { campaignId: string; ownerProfileId: string; customDieId: string; file: File }) {
  const blob = await normalizeDiceFaceImage(input.file);
  const assetPath = `${input.campaignId}/${input.ownerProfileId}/${input.customDieId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(assetPath, blob, { contentType: 'image/webp', upsert: false });
  if (error) throw new Error(`Errore caricamento immagine faccia: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(assetPath);
  return { assetPath, publicUrl: data.publicUrl };
}

export async function removeDiceFaceAsset(assetPath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([assetPath]);
  if (error) throw new Error(`Errore eliminazione immagine faccia: ${error.message}`);
}
