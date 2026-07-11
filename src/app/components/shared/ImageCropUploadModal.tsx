import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Loader2, Upload, RotateCcw, Trash2 } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';
import { supabase } from '../../auth/AuthContext';

interface ImageCropUploadModalProps {
  bucket: string;
  storagePath: string;
  cropShape?: 'round' | 'rect';
  aspect?: number;
  uploadLabel?: string;
  existingImageUrl?: string;
  onUploaded: (publicUrl: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const MAX_IMAGE_MB = 5;

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile');
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Esportazione fallita'))), 'image/jpeg', 0.92);
  });
}

export function ImageCropUploadModal({ bucket, storagePath, cropShape = 'rect', aspect = 1, uploadLabel, existingImageUrl, onUploaded, onRemove, onClose }: ImageCropUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(existingImageUrl ?? null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Seleziona un file immagine (JPG, PNG, WEBP...).');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`L'immagine non può superare i ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setRawImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleCancelCrop = () => {
    if (existingImageUrl) {
      if (rawImageSrc !== existingImageUrl) {
        setRawImageSrc(existingImageUrl);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      } else {
        onClose();
      }
      return;
    }
    setRawImageSrc(null);
  };

  useEffect(() => {
    const el = cropAreaRef.current;
    if (!el || !rawImageSrc) return;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => {
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
      });
    };
    el.addEventListener('wheel', wheelHandler, { passive: false });
    return () => el.removeEventListener('wheel', wheelHandler);
  }, [rawImageSrc]);

  const handleConfirm = async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;
    setIsUploading(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(rawImageSrc, croppedAreaPixels);
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      onUploaded(`${publicUrl}?t=${Date.now()}`);
      setRawImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err) {
      console.error('Errore upload immagine:', err);
      setError('Caricamento non riuscito. Riprova.');
    } finally {
      setIsUploading(false);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  };
  const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)', borderRadius: 16,
    padding: '1.75rem', width: '100%', maxWidth: 420, fontFamily: 'sans-serif', position: 'relative',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none',
                   color: 'var(--dash-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={18} />
        </button>

        <h2 style={{ fontFamily: 'serif', color: 'var(--dash-text)', fontSize: '1.2rem', fontWeight: 'bold',
                     textAlign: 'center', marginBottom: '1.25rem' }}>
          {rawImageSrc ? 'Ritaglia immagine' : (uploadLabel ?? 'Carica immagine')}
        </h2>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />

        {!rawImageSrc ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0' }}>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.25rem',
                       borderRadius: 999, backgroundColor: 'transparent', border: '1.5px solid var(--dash-accent)',
                       color: 'var(--dash-accent)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
              <Upload size={16} /> Scegli immagine
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem',
                         borderRadius: 999, backgroundColor: 'transparent', border: '1.5px solid var(--dash-danger-border)',
                         color: 'var(--dash-danger-text)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                <Trash2 size={14} /> Elimina logo
              </button>
            )}
            {error && <p style={{ color: 'var(--dash-danger-text)', fontSize: '0.8rem' }}>{error}</p>}
          </div>
        ) : (
          <>
            <div
              ref={cropAreaRef}
              style={{ position: 'relative', width: '100%', height: 280, backgroundColor: '#000',
                        borderRadius: 12, overflow: 'hidden', touchAction: 'none' }}
            >
              <Cropper
                image={rawImageSrc} crop={crop} zoom={zoom} aspect={aspect} cropShape={cropShape} showGrid={false}
                zoomWithScroll={false}
                onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
              />
            </div>
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width: '100%', marginTop: '1.25rem', accentColor: 'var(--dash-accent)' }} />

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                         padding: '0.5rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.8rem',
                         cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                <Upload size={13} /> Carica nuova immagine
              </button>
              {onRemove && (
                <button type="button" onClick={onRemove} disabled={isUploading}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                           padding: '0.5rem 0.9rem', borderRadius: 999, backgroundColor: 'transparent',
                           border: '1px solid var(--dash-danger-border)', color: 'var(--dash-danger-text)', fontSize: '0.8rem',
                           cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                  <Trash2 size={13} /> Elimina
                </button>
              )}
            </div>

            {error && <p style={{ color: 'var(--dash-danger-text)', fontSize: '0.8rem', marginTop: '0.6rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem' }}>
              <button type="button" onClick={handleCancelCrop} disabled={isUploading}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.875rem', cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} disabled={isUploading}
                title="Ripristina zoom e posizione"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                         width: 40, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                <RotateCcw size={15} />
              </button>
              <button type="button" onClick={handleConfirm} disabled={isUploading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                         padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)', fontWeight: 600,
                         fontSize: '0.875rem', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.6 : 1 }}>
                {isUploading && <Loader2 size={14} className="animate-spin" />}
                {isUploading ? 'Caricamento...' : 'Conferma'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
