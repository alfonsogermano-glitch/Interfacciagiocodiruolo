import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Plus, Trash2, X } from 'lucide-react';
import { generateUUID } from '../../../lib/uuid';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import {
  VISUAL_ASSETS_CHANGED_EVENT,
  loadVisualAssetPreviews,
  regenerateMissingVisualAssetThumbnails,
  visualAssetsStorage,
  type VisualAsset,
  type VisualAssetType
} from '../../../services/storage/visualAssetsStorage';

const ASSET_TYPE_OPTIONS: Array<{ value: VisualAssetType; label: string }> = [
  { value: 'monster-portrait-frame-default', label: 'Cornice Portrait Mostro Default' },
  { value: 'monster-frame-default', label: 'Cornice Foto Mostro Default' },
  { value: 'monster-portrait-frame', label: 'Cornice Portrait Mostro' },
  { value: 'monster-frame', label: 'Cornice Foto Mostro' },
  { value: 'npc-frame', label: 'Cornice PNG' },
  { value: 'ui-decoration', label: 'Decorazione interfaccia' },
  { value: 'item-image', label: 'Immagine Oggetto' },
  { value: 'other', label: 'Altro' }
];

interface VisualAssetsManagerProps {
  campaignId?: string;
  storageRefreshKey?: number;
}

function getAssetTypeLabel(type: VisualAssetType): string {
  return ASSET_TYPE_OPTIONS.find(option => option.value === type)?.label ?? type;
}

function createImageThumbnail(dataUrl: string, maxSize = 360): Promise<string> {
  return new Promise(resolve => {
    const image = new window.Image();

    image.onload = () => {
      const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const width = Math.max(1, Math.round(image.width * ratio));
      const height = Math.max(1, Math.round(image.height * ratio));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };

    image.onerror = () => resolve(dataUrl);
    image.crossOrigin = 'anonymous';
    image.src = dataUrl;
  });
}

export function VisualAssetsManager({
  campaignId = '',
  storageRefreshKey = 0
}: VisualAssetsManagerProps) {
  const [assets, setAssets] = useState<VisualAsset[]>([]);
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<VisualAssetType>('monster-frame');
  const [assetToDelete, setAssetToDelete] = useState<VisualAsset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false);
  const [thumbnailProgress, setThumbnailProgress] = useState<{
    processed: number;
    total: number;
    updated: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const { user } = useAuth();

  const clearSelectedFile = () => {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    let cancelled = false;

    const loadAssets = async () => {
      setIsLoading(true);
      setVisibleCount(24);

      try {
        const items = await loadVisualAssetPreviews(campaignId);

        if (cancelled) return;

        setAssets(
          items.sort((a, b) =>
            a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
          )
        );
      } catch (error) {
        console.error('Errore caricamento asset grafici:', error);

        if (!cancelled) {
          setAssets([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadAssets();

    const handleVisualAssetsChanged = () => {
      void loadAssets();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);
    }

    return () => {
      cancelled = true;

      if (typeof window !== 'undefined') {
        window.removeEventListener(VISUAL_ASSETS_CHANGED_EVENT, handleVisualAssetsChanged);
      }
    };
  }, [campaignId, storageRefreshKey]);

  const groupedAssets = useMemo(() => assets, [assets]);
  const visibleAssets = useMemo(
    () => groupedAssets.slice(0, visibleCount),
    [groupedAssets, visibleCount]
  );

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Seleziona un file immagine valido.');
      event.target.value = '';
      return;
    }

    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(file);
    setFilePreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const file = selectedFile;
    const assetId = generateUUID();

    const saveAsset = async (imageDataUrl: string) => {
      const thumbnailDataUrl = await createImageThumbnail(imageDataUrl);

      const newAsset: VisualAsset = {
        id: assetId,
        campaignId,
        name: assetName.trim(),
        type: assetType,
        imageDataUrl,
        thumbnailDataUrl,
        createdAt: new Date().toISOString()
      };

      setAssets(previous =>
        [newAsset, ...previous].sort((a, b) =>
          a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        )
      );

      try {
        await visualAssetsStorage.upsert(newAsset);
      } catch (error) {
        console.error('Errore salvataggio asset grafico:', error);
      }

      setAssetName('');
      clearSelectedFile();
    };

    const readAsBase64 = () => {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (result) await saveAsset(result);
      };
      reader.readAsDataURL(file);
    };

    if (isSupabaseConfigured && supabase && user) {
      setIsUploading(true);
      try {
        const ext = file.name.split('.').pop() ?? 'png';
        const filePath = `${user.id}/${assetId}-${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('visual-assets')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('visual-assets')
          .getPublicUrl(filePath);

        await saveAsset(publicUrl);
      } catch (err) {
        console.error('Errore upload asset su Storage:', err);
        readAsBase64();
      } finally {
        setIsUploading(false);
      }
    } else {
      readAsBase64();
    }
  };

  const handleRegenerateThumbnails = async () => {
    setIsRegeneratingThumbnails(true);
    setThumbnailProgress({ processed: 0, total: 0, updated: 0 });

    try {
      const result = await regenerateMissingVisualAssetThumbnails(campaignId, progress => {
        setThumbnailProgress(progress);
      });

      const items = await loadVisualAssetPreviews(campaignId);
      setAssets(
        items.sort((a, b) =>
          a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
        )
      );
      setThumbnailProgress(result);
    } catch (error) {
      console.error('Errore rigenerazione anteprime asset grafici:', error);
      alert('Errore durante la rigenerazione delle anteprime. Controlla la console.');
    } finally {
      setIsRegeneratingThumbnails(false);
    }
  };

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return;

    const assetId = assetToDelete.id;
    const previousAssets = assets;

    setIsDeleting(true);
    setAssets(current => current.filter(asset => asset.id !== assetId));

    try {
      await visualAssetsStorage.remove(assetId);
      setAssetToDelete(null);
    } catch (error) {
      console.error('Errore eliminazione asset grafico:', error);
      setAssets(previousAssets);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--dash-text-strong)]">
              Asset grafici
            </h2>

            <p className="mt-1 text-sm text-[var(--dash-muted)]">
              Carica cornici, decorazioni e immagini riutilizzabili
              nell’interfaccia della campagna.
            </p>
          </div>

          <Image className="h-8 w-8 text-[var(--dash-accent-2)]" />
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--dash-muted)]">
              1. Scegli immagine
            </p>
            <div className="flex items-center gap-3">
              <label className="group inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface)]">
                <Plus className="h-4 w-4" />
                Scegli file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              {selectedFile && (
                <div className="flex items-center gap-3">
                  {filePreviewUrl && (
                    <img
                      src={filePreviewUrl}
                      alt="Preview"
                      className="h-10 w-10 rounded border border-[var(--dash-border)] object-cover"
                    />
                  )}
                  <span className="text-sm text-[var(--dash-text)]">
                    {selectedFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-danger-text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--dash-muted)]">
              2. Nome e tipo
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                value={assetName}
                onChange={e => setAssetName(e.target.value)}
                placeholder="Nome asset, es. Cornice mostro"
                className="rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
              />

              <select
                value={assetType}
                onChange={e => setAssetType(e.target.value as VisualAssetType)}
                className="rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
              >
                {ASSET_TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--dash-muted)]">
              3. Carica
            </p>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!selectedFile || !assetName.trim() || isUploading}
              className="group inline-flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {isUploading ? 'Caricamento…' : 'Carica immagine'}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--dash-text-strong)]">
                Anteprime asset
              </h3>
              <p className="mt-1 text-xs text-[var(--dash-muted)]">
                Rigenera le thumbnail mancanti per gli asset vecchi e alleggerisce il caricamento del tab.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleRegenerateThumbnails()}
              disabled={isRegeneratingThumbnails}
              className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface)] disabled:cursor-wait disabled:opacity-60"
            >
              {isRegeneratingThumbnails ? 'Rigenerazione…' : 'Rigenera anteprime mancanti'}
            </button>
          </div>

          {thumbnailProgress && (
            <p className="mt-3 text-xs text-[var(--dash-muted)]">
              Anteprime: {thumbnailProgress.processed} / {thumbnailProgress.total}
              {thumbnailProgress.total > 0 && ` · Aggiornate ${thumbnailProgress.updated}`}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center text-sm text-[var(--dash-muted)]">
          Caricamento asset grafici…
        </div>
      ) : groupedAssets.length === 0 ? (
        <div className="rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] p-12 text-center">
          <Image className="mx-auto mb-4 h-14 w-14 text-[var(--dash-muted)]" />

          <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
            Nessun asset caricato
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--dash-muted)]">
            Carica una cornice o una decorazione per usarla nelle schede della
            campagna.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleAssets.map(asset => (
            <div
              key={asset.id}
              className="overflow-hidden rounded-2xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]"
            >
              <div className="flex h-48 items-center justify-center bg-[var(--dash-text)] bg-[radial-gradient(circle,var(--dash-text-strong)_1px,transparent_1px)] [background-size:16px_16px]">
                {asset.thumbnailDataUrl || asset.imageDataUrl ? (
                  <img
                    src={asset.thumbnailDataUrl || asset.imageDataUrl}
                    alt={asset.name}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="px-4 text-center text-xs text-[var(--dash-muted)]">
                    Immagine non disponibile.
                    <br />
                    L’asset non contiene dati immagine salvati.
                  </div>
                )}
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <h3 className="truncate font-semibold text-[var(--dash-text-strong)]">
                    {asset.name}
                  </h3>

                  <p className="mt-1 text-xs uppercase tracking-[0.08em] text-[var(--dash-muted)]">
                    {getAssetTypeLabel(asset.type)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setAssetToDelete(asset)}
                  className="group inline-flex items-center gap-2 rounded-md border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-3 py-2 text-sm text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-hover)]"
                >
                  <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
                  Elimina
                </button>
              </div>
            </div>
            ))}
          </div>

          {visibleCount < groupedAssets.length && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount(count => count + 24)}
                className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
              >
                Mostra altri asset ({Math.min(24, groupedAssets.length - visibleCount)})
              </button>
            </div>
          )}
        </>
      )}

      {assetToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--dash-text-strong)]">
              Eliminare asset grafico?
            </h3>

            <p className="mt-3 text-sm text-[var(--dash-muted)]">
              Vuoi eliminare definitivamente “{assetToDelete.name}”? Questa azione non può essere annullata.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssetToDelete(null)}
                disabled={isDeleting}
                className="group flex items-center gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)] disabled:opacity-60"
              >
                <X className="h-4 w-4 group-hover:animate-[cancelWiggle_0.55s_ease-in-out_infinite]" />
                Annulla
              </button>

              <button
                type="button"
                onClick={() => void confirmDeleteAsset()}
                disabled={isDeleting}
                className="group flex items-center gap-2 rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-hover)] disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4 group-hover:animate-[trashShake_0.55s_ease-in-out_infinite]" />
                {isDeleting ? 'Eliminazione…' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




