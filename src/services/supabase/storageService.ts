import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import type { ImageCrop } from '../../app/components/gm/monsters/monstersTypes';

/**
 * Carica un file (o Blob, es. un export canvas) su Supabase Storage e
 * ritorna l'URL pubblico. Se Supabase non e' configurato, ritorna una
 * data URL locale (stessa strategia di fallback gia' usata per l'upload
 * portrait dei Mostri in MonstersManager.tsx, qui generalizzata).
 */
export async function uploadImageToStorage(params: {
  file: Blob;
  bucket: string;
  path: string;
  contentType?: string;
}): Promise<string> {
  const { file, bucket, path, contentType } = params;

  if (isSupabaseConfigured && supabase) {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: contentType ?? (file.type || 'image/jpeg') });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
    return `${publicUrl}?t=${Date.now()}`;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lettura file fallita'));
    reader.readAsDataURL(file);
  });
}

const BAKE_SIZE = 512;
// Stesso box di riferimento su cui lavora l'editor live (PortraitCropFrame:
// h-52 w-52 = 208px) - il crop {x,y,scale} e' espresso in pixel di
// quel box, va riproporzionato alla risoluzione di export.
const EDITOR_BOX_SIZE = 208;

/**
 * "Cuoce" in un JPEG quadrato il risultato del crop live {x,y,scale},
 * riproducendo sul canvas la stessa trasformazione (translate/scale/rotate,
 * transform-origin center) applicata a schermo in PortraitCropFrame, poi
 * carica il risultato su Storage. Nessuna mascheratura circolare: i
 * consumer esistenti (card, DraggablePortrait...) applicano gia' il loro
 * proprio rounded-full sull'immagine "cotta", esattamente come facevano
 * con l'export di ImageCropUploadModal.
 */
export async function bakePortraitCrop(params: {
  imageUrl: string;
  crop: ImageCrop;
  rotationDegrees: number;
  bucket: string;
  path: string;
}): Promise<string> {
  const { imageUrl, crop, rotationDegrees, bucket, path } = params;

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Caricamento immagine fallito'));
    img.src = imageUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = BAKE_SIZE;
  canvas.height = BAKE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');

  // "object-fit: contain" dentro il box editor, poi scala su BAKE_SIZE.
  const containScale = Math.min(BAKE_SIZE / image.width, BAKE_SIZE / image.height);
  const drawWidth = image.width * containScale;
  const drawHeight = image.height * containScale;
  const ratio = BAKE_SIZE / EDITOR_BOX_SIZE;

  ctx.save();
  ctx.translate(BAKE_SIZE / 2 + crop.x * ratio, BAKE_SIZE / 2 + crop.y * ratio);
  ctx.scale(crop.scale, crop.scale);
  ctx.rotate((rotationDegrees * Math.PI) / 180);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      result => (result ? resolve(result) : reject(new Error('Esportazione fallita'))),
      'image/jpeg',
      0.92
    );
  });

  return uploadImageToStorage({ file: blob, bucket, path, contentType: 'image/jpeg' });
}
