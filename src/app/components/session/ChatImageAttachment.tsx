import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ChatAttachment } from '../../../services/supabase/chatService';
import { resolveAttachmentBlob } from './chatAttachments';

/** Risolve l'immagine dal suo storage originale, anche dopo un cambio modalità. */
export function ChatImageAttachment({ attachment, onDownload }: { attachment: ChatAttachment; onDownload: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSrc(null);
    setFailed(false);
    void resolveAttachmentBlob(attachment).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.bucket, attachment.assetPath, attachment.storage]);

  return (
    <button
      type="button"
      aria-label={`Scarica ${attachment.fileName}`}
      onClick={onDownload}
      style={!failed && attachment.imageWidth && attachment.imageHeight ? { aspectRatio: `${attachment.imageWidth} / ${attachment.imageHeight}` } : undefined}
      className="block w-full min-w-0 cursor-pointer overflow-hidden rounded-lg rounded-tl-none border border-[var(--dash-border)] bg-[var(--dash-surface)] text-left text-sm text-[var(--dash-text)]"
    >
      {failed ? <span className="block px-3 py-2">Immagine non disponibile: {attachment.fileName}. Clicca per scaricare.</span>
        : src ? <img src={src} alt={attachment.fileName} width={attachment.imageWidth} height={attachment.imageHeight} onError={() => setFailed(true)} className="block h-auto w-full max-w-full" />
        : <span role="status" className="flex items-center gap-2 px-3 py-2"><Loader2 className="h-4 w-4 animate-spin" />Caricamento immagine…</span>}
    </button>
  );
}
