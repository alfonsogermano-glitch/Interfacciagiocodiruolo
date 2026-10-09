import { supabase } from '../../../lib/supabaseClient';
import { selectedContentMode } from '../../../services/storage/persistenceMode';
import { loadContentAssetDataUrl, uploadContentAsset } from '../../../services/storage/contentAssets';
import type { ChatAttachment } from '../../../services/supabase/chatService';

/** Bucket degli allegati chat: qualsiasi tipo di file (nessun vincolo di
 mime), limite 50 MB imposto anche dalla migration del bucket. */
export const CHAT_ATTACHMENTS_BUCKET = 'chat-attachments';

/** Dimensione massima di un allegato: 50 MB (byte). */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Verifica che il browser possa visualizzarla e conserva le proporzioni. */
export async function readChatImageSize(file: File): Promise<{ imageWidth: number; imageHeight: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Dimensioni immagine non valide.');
    return { imageWidth: image.naturalWidth, imageHeight: image.naturalHeight };
  } catch {
    throw new Error('Immagine non leggibile. Scegli un formato supportato dal browser (ad esempio PNG, JPEG, GIF o WebP).');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Estensione con punto (".pdf") del nome file; vuota se assente o anomala. */
export function attachmentExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  const ext = fileName.slice(dot);
  return ext.length <= 13 && !/[\\/:*?"<>|\s]/.test(ext) ? ext : '';
}

/** Nome base + estensione per la card in chat ("report" + ".pdf"). */
export function splitAttachmentName(fileName: string): { base: string; ext: string } {
  const ext = attachmentExt(fileName);
  return { base: ext ? fileName.slice(0, fileName.length - ext.length) : fileName, ext };
}

/** Nome file "sicuro" per il path di storage: il nome originale resta nel
 payload (bella card e finestra Salva con nome), qui servono solo caratteri
 che reggono gli URL. Percorsi, controlli e spazi non sopravvivono. */
export function safeAttachmentPathName(fileName: string): string {
  const ext = attachmentExt(fileName);
  const base = ext ? fileName.slice(0, fileName.length - ext.length) : fileName;
  const cleaned = base
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 64) || 'file';
  return `${cleaned}${ext}`;
}

/**
 * Carica il file nel posto giusto secondo la Modalita' salvataggio scelta
 * dall'utente: Locale = data-URL in IndexedDB, Cloud = bucket Storage
 * (uploadContentAsset fa esattamente questo routing). La modalita' viene
 * catturata PRIMA dell'await: e' quella scelta al momento del caricamento e
 * viene memorizzata in payload.storage per poi risalire al file al download.
 * Il payload della riga chat resta piccolo: nessun data-URL nella chat.
 */
export async function uploadChatAttachment(input: {
  file: File;
  campaignId: string;
  userId: string;
}): Promise<ChatAttachment> {
  const storage = selectedContentMode();
  const contentType = input.file.type || 'application/octet-stream';
  const assetPath = `${input.campaignId}/${input.userId}/${crypto.randomUUID()}-${safeAttachmentPathName(input.file.name)}`;
  await uploadContentAsset(CHAT_ATTACHMENTS_BUCKET, assetPath, input.file, { contentType });
  return {
    fileName: input.file.name,
    size: input.file.size,
    contentType,
    bucket: CHAT_ATTACHMENTS_BUCKET,
    assetPath,
    storage,
  };
}

/** Blob dell'allegato, letto dal negozio in cui e' stato caricato (non dalla
 modalita' corrente: il file potrebbe essere stato salvato in Locale prima di
 uno switch su Cloud, o viceversa). */
export async function resolveAttachmentBlob(attachment: ChatAttachment): Promise<Blob> {
  if (attachment.storage === 'local') {
    const dataUrl = await loadContentAssetDataUrl(attachment.bucket, attachment.assetPath);
    if (!dataUrl) throw new Error('File non trovato nello storage locale');
    return (await fetch(dataUrl)).blob();
  }
  if (!supabase) throw new Error('Supabase non disponibile');
  const { publicUrl } = supabase.storage.from(attachment.bucket).getPublicUrl(attachment.assetPath).data;
  const response = await fetch(publicUrl);
  if (!response.ok) throw new Error(`Download non riuscito (${response.status})`);
  return response.blob();
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

/** Gli appunti interoperabili richiedono PNG, anche per JPEG/GIF/WebP. */
export async function chatImageClipboardBlob(attachment: ChatAttachment): Promise<Blob> {
  const blob = await resolveAttachmentBlob(attachment);
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Copia immagine non disponibile.');
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => png ? resolve(png) : reject(new Error('Conversione immagine non riuscita.')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Salva il file su disco aprendo la finestra di dialogo "Salva con nome"
 * (File System Access API, Chromium): l'utente sceglie la cartella locale.
 * Suggerisce il nome originale del file. Su browser senza supporto (Firefox,
 * Safari) o in caso di errore si ripiega sul download dell'anchor con
 * `download = fileName`, che usa la gestione download del browser.
 * La cancellazione della finestra (AbortError) non ripiega: e' un annullamento.
 */
export async function saveAttachmentToDisk(attachment: ChatAttachment): Promise<void> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      // La finestra va aperta SUBITO nel gesto di click: l'attivazione utente
      // e' transiente e un download lungo potrebbe esaurirla. I bytes arrivano
      // mentre la finestra e' gia' aperta e vengono scritti nel percorso scelto.
      const handle = await picker({ suggestedName: attachment.fileName });
      const blob = await resolveAttachmentBlob(attachment);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.warn('[Chat] Finestra Salva con nome non disponibile, fallback download:', error);
    }
  }
  const blob = await resolveAttachmentBlob(attachment);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
