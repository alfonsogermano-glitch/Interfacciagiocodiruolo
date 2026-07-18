import { useState, useRef, useCallback, useEffect } from 'react';
import { Loader2, Upload, RotateCcw, Trash2, Images } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';
import { supabase } from '../../auth/AuthContext';
import { renderShapeSvgChild } from './TokenShapePreview';
import type { TokenShapeGeometry } from './tokenShapes';

export interface ImageCropCoreProps {
  bucket: string;
  storagePath: string;
  cropShape?: 'round' | 'rect';
  aspect?: number;
  uploadLabel?: string;
  existingImageUrl?: string;
  /** Ultima area di ritaglio confermata (percentuali, formato nativo di
   *  react-easy-crop) - se presente, il cropper riparte da li' invece che
   *  da centro/zoom di default quando l'editor (ri)monta. */
  existingCropArea?: Area;
  /** Guida visiva non interattiva: contorno reale della forma Token scelta
   *  (tokenShapes.ts, gia' tarata al proprio massimo edge-to-edge) - la
   *  cattura resta sempre il quadrato intero, questa e' solo un aiuto per
   *  centrare il soggetto dentro l'area che la forma finale mostrera'
   *  davvero. Assente = nessuna guida (avatar utente, logo campagna, dove
   *  non c'e' una forma Token da anticipare). Non influisce sul crop
   *  salvato. */
  cropGuideGeometry?: TokenShapeGeometry;
  /** Se true, oltre al ritaglio quadrato viene caricata anche una versione
   *  ridimensionata del file originale scelto (solo quando si sceglie un
   *  file nuovo, mai per un semplice re-crop) - per un ritaglio non
   *  distruttivo, chi la riceve la ripassa come existingImageUrl la volta
   *  successiva invece del solo risultato ritagliato. Assente/false per
   *  logo campagna e cover/portrait della creation wizard: comportamento
   *  invariato, solo il ritaglio viene caricato e mostrato. */
  preserveSource?: boolean;
  /** Presente = mostra il pulsante "Raccolta immagini", che al click chiama
   *  questa callback (apertura del picker demandata al chiamante, che
   *  conosce l'owner/l'entita' - ImageCropCore resta generico, usato anche
   *  per avatar utente/logo campagna dove la raccolta non ha senso).
   *  Assente = pulsante non mostrato, comportamento invariato. */
  onPickFromCollection?: () => void;
  /** Chiamata una sola volta per conferma, con tutti i dati di quella
   *  conferma - cosi' chi la consuma puo' fare un solo merge/onUpdate
   *  invece di piu' chiamate separate che rischiano di sovrascriversi a
   *  vicenda (ognuna spreaderebbe dallo stesso stato "vecchio" catturato
   *  al click, perdendo il campo impostato dall'altra). */
  onUploaded: (publicUrl: string, extra?: { sourceUrl?: string; cropArea?: Area }) => void;
  onRemove?: () => void;
  /** Se assente (uso inline, senza overlay da chiudere), "Annulla" si
   *  nasconde quando non c'e' nulla da annullare (immagine esistente non
   *  ancora modificata) invece di chiudere un modal inesistente. */
  onClose?: () => void;
  /** Assente (default) = comportamento invariato, salvataggio solo al click
   *  su "Conferma" (logo campagna, cover campagna, wizard creazione PG -
   *  crop distruttivo puro, nessun campo separato per un Annulla-revert,
   *  non toccare). Presente = ogni drag/zoom che si assesta (onCropComplete)
   *  pianifica un salvataggio automatico dopo questo numero di millisecondi
   *  (azzerrato e riprogrammato a ogni nuovo assestamento, cosi' un drag
   *  continuo produce un solo salvataggio alla pausa finale, non uno per
   *  pixel - stesso principio del debounce gia' in uso per il testo delle
   *  tab custom, vedi useEntityTabs.ts). Il pulsante "Conferma" si nasconde
   *  (diventato superfluo); un salvataggio pendente alla chiusura del
   *  componente (unmount) viene eseguito subito invece di perdere l'ultima
   *  modifica. Usato oggi solo da EntityImageTab.tsx (ritaglio PG/PNG/Mostri). */
  autosaveDebounceMs?: number;
  /** Rilevante solo insieme ad autosaveDebounceMs: "Annulla" con autosave
   *  attivo non ha piu' un semplice stato locale da scartare (il crop
   *  potrebbe gia' essere stato salvato automaticamente) - questa callback
   *  chiede al chiamante di riportare l'entita' ai valori precedenti
   *  l'apertura dell'editor. Il ripristino visivo locale (posizione crop,
   *  immagine) segue da solo quando il chiamante fa arrivare le prop
   *  existingImageUrl/existingCropArea aggiornate (stesso effect gia'
   *  esistente per un cambiamento esterno), nessuna azione locale aggiuntiva
   *  necessaria qui. */
  onCancelAutosaved?: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const MAX_IMAGE_MB = 5;
const MAX_SOURCE_DIMENSION = 1600;

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

// Sorgente non distruttiva: ridimensionata (non il file grezzo) per tenere
// sotto controllo il costo di storage - lato lungo <= MAX_SOURCE_DIMENSION,
// stessa tecnica canvas di getCroppedBlob, nessuna nuova dipendenza.
async function getResizedSourceBlob(file: File, maxDimension: number): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Esportazione fallita'))), 'image/jpeg', 0.9);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function deriveSourceStoragePath(path: string): string {
  return path.replace(/(\.[^./]+)$/, '-source$1');
}

export function ImageCropCore({ bucket, storagePath, cropShape = 'rect', aspect = 1, uploadLabel, existingImageUrl, existingCropArea, cropGuideGeometry, preserveSource, onPickFromCollection, onUploaded, onRemove, onClose, autosaveDebounceMs, onCancelAutosaved }: ImageCropCoreProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);
  // Timer del debounce autosave - un solo salvataggio alla pausa, non uno
  // per pixel. handleConfirmRef punta sempre alla versione piu' recente di
  // handleConfirm (assegnato a ogni render, sotto): il timer puo' scattare
  // molti render dopo essere stato programmato, non deve richiamare una
  // chiusura ormai vecchia su rawImageSrc/croppedAreaPixels.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleConfirmRef = useRef<() => Promise<void>>(async () => {});
  // Forza un remount del <Cropper> quando existingImageUrl/existingCropArea
  // cambiano (vedi effect sotto) - necessario perche' initialCroppedAreaPercentages
  // viene letto da react-easy-crop solo al mount, non ad ogni cambio prop.
  // Innocuo per l'eco della nostra stessa autosave (la posizione coincide
  // gia' con quella visibile, nessuno scatto visivo) ed e' cio' che fa
  // scattare visivamente indietro il crop dopo un Annulla con autosave.
  const [cropperInstanceKey, setCropperInstanceKey] = useState(0);
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(existingImageUrl ?? null);
  // File grezzo scelto dall'utente, non ancora confermato - serve a
  // handleConfirm per sapere se caricare anche una sorgente nuova (solo
  // quando e' stato scelto un file diverso, mai a ogni conferma di un
  // semplice re-crop della sorgente gia' esistente).
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null);
  // Guida di ripristino per <Cropper initialCroppedAreaPercentages>: solo
  // per un mount fresco o un existingImageUrl arrivato dall'esterno, mai
  // per un reload auto-innescato dalla nostra stessa handleConfirm (in
  // quei casi il posizionamento lo gestiamo gia' noi, vedi handleConfirm).
  const [cropAreaForRestore, setCropAreaForRestore] = useState<Area | undefined>(existingCropArea);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((area: Area, areaPixels: Area) => {
    setCroppedArea(area);
    setCroppedAreaPixels(areaPixels);
    if (autosaveDebounceMs) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        autosaveTimerRef.current = null;
        void handleConfirmRef.current();
      }, autosaveDebounceMs);
    }
  }, [autosaveDebounceMs]);

  // Un salvataggio autosave pendente non deve perdersi se il componente si
  // smonta prima che il debounce scatti (es. si chiude la scheda dettaglio
  // subito dopo l'ultimo aggiustamento) - lo eseguiamo subito invece di
  // scartare l'ultima modifica.
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
        void handleConfirmRef.current();
      }
    };
  }, []);

  // Il componente resta montato tra un salvataggio e l'altro (uso inline,
  // niente overlay da smontare/rimontare) - senza questo effect rawImageSrc
  // resterebbe agganciato al valore letto al primo mount anche quando il
  // genitore riceve un existingImageUrl aggiornato dall'esterno (es. dopo
  // Elimina, gestito altrove nel genitore).
  useEffect(() => {
    setRawImageSrc(existingImageUrl ?? null);
    setSelectedFile(null);
    setCropAreaForRestore(existingCropArea);
    setCropperInstanceKey(k => k + 1);
  }, [existingImageUrl, existingCropArea]);

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
    setSelectedFile(file);
    setRawImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  // Senza onClose (uso inline, nessun overlay da chiudere) non c'e' nulla
  // da "annullare" quando si sta gia' guardando l'immagine esistente
  // invariata - il pulsante Annulla si nasconde in quello stato specifico.
  // Con autosave attivo il crop puo' essere gia' stato salvato anche se
  // rawImageSrc non e' mai cambiato (un semplice re-crop non tocca la
  // sorgente) - "nulla da annullare" non e' piu' un'ipotesi valida, "Annulla"
  // resta sempre disponibile (un click quando non c'e' nulla da ripristinare
  // e' innocuo: onCancelAutosaved riapplica gli stessi valori).
  const hasNothingToCancel = !autosaveDebounceMs && !!existingImageUrl && rawImageSrc === existingImageUrl && !onClose;

  const handleCancelCrop = () => {
    if (autosaveDebounceMs) {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      // Nessun reset locale manuale qui: il ripristino visivo arriva da
      // solo quando il chiamante fa ripiombare existingImageUrl/
      // existingCropArea ai valori precedenti l'apertura (effect sopra),
      // che e' anche l'unico posto che conosce il vero valore originale.
      onCancelAutosaved?.();
      return;
    }
    if (existingImageUrl) {
      if (rawImageSrc !== existingImageUrl) {
        setRawImageSrc(existingImageUrl);
        setSelectedFile(null);
        // Fallback se non c'e' un crop salvato da ripristinare; se c'e',
        // il reload che segue lo ripristina con precisione (vedi Cropper).
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCropAreaForRestore(existingCropArea);
      } else {
        onClose?.();
      }
      return;
    }
    setRawImageSrc(null);
    setSelectedFile(null);
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
      const uploadedUrl = `${publicUrl}?t=${Date.now()}`;

      let uploadedSourceUrl: string | undefined;
      if (selectedFile && preserveSource) {
        // Sorgente nuova da preservare: ridimensionata e caricata a parte,
        // cosi' la prossima apertura riparte dalla foto intera invece che
        // dall'ultimo quadrato salvato.
        const sourceBlob = await getResizedSourceBlob(selectedFile, MAX_SOURCE_DIMENSION);
        const sourcePath = deriveSourceStoragePath(storagePath);
        const { error: sourceUploadError } = await supabase.storage
          .from(bucket)
          .upload(sourcePath, sourceBlob, { upsert: true, contentType: 'image/jpeg' });
        if (sourceUploadError) throw sourceUploadError;
        const { data: { publicUrl: sourcePublicUrl } } = supabase.storage.from(bucket).getPublicUrl(sourcePath);
        uploadedSourceUrl = `${sourcePublicUrl}?t=${Date.now()}`;
      }

      // Un'unica chiamata con tutto l'esito di questa conferma: chi
      // consuma puo' fare un solo merge invece di piu' chiamate separate
      // che rischierebbero di sovrascriversi a vicenda.
      onUploaded(uploadedUrl, { sourceUrl: uploadedSourceUrl, cropArea: croppedArea ?? undefined });

      if (uploadedSourceUrl) {
        // Sorgente ridimensionata ma stessa proporzione del file originale:
        // crop/zoom correnti restano validi cosi' come sono, il ripristino
        // della libreria non serve (e andrebbe comunque disattivato per
        // non sovrascriverli con un valore vecchio non ancora aggiornato).
        setRawImageSrc(uploadedSourceUrl);
        setCropAreaForRestore(undefined);
      } else if (selectedFile) {
        // Nessuna sorgente da preservare (es. logo campagna, creation
        // wizard): l'immagine ricaricata e' il ritaglio quadrato stesso,
        // tutt'altra inquadratura del file originale - reset ai default.
        setRawImageSrc(uploadedUrl);
        setCropAreaForRestore(undefined);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      }
      // Se non e' stato scelto un file nuovo (semplice re-crop della
      // sorgente gia' esistente), rawImageSrc/crop/zoom restano invariati:
      // la posizione appena regolata resta quella mostrata, nessuno scatto.

      setSelectedFile(null);
      setCroppedAreaPixels(null);
      setCroppedArea(null);
    } catch (err) {
      console.error('Errore upload immagine:', err);
      setError('Caricamento non riuscito. Riprova.');
    } finally {
      setIsUploading(false);
    }
  };
  // Aggiornato a ogni render: il timer del debounce autosave puo' scattare
  // molti render dopo essere stato programmato (vedi onCropComplete sopra),
  // deve sempre invocare la versione piu' recente di handleConfirm, non
  // quella catturata al momento della programmazione.
  handleConfirmRef.current = handleConfirm;

  return (
    <>
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
          {onPickFromCollection && (
            <button type="button" onClick={onPickFromCollection}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.1rem',
                       borderRadius: 999, backgroundColor: 'transparent', border: '1px solid var(--dash-border)',
                       color: 'var(--dash-muted)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
              <Images size={15} /> Raccolta immagini
            </button>
          )}
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
              key={cropperInstanceKey}
              image={rawImageSrc} crop={crop} zoom={zoom} aspect={aspect} cropShape={cropShape} showGrid={false}
              zoomWithScroll={false}
              initialCroppedAreaPercentages={cropAreaForRestore}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
              onCropSizeChange={setCropSize}
            />
            {cropGuideGeometry && cropSize && (
              <svg
                viewBox="0 0 1 1"
                style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: cropSize.width, height: cropSize.height, pointerEvents: 'none',
                }}
              >
                {renderShapeSvgChild(cropGuideGeometry, {
                  fill: 'none',
                  stroke: 'rgba(255,255,255,0.65)',
                  strokeWidth: 0.007,
                  strokeDasharray: '0.02 0.015',
                })}
              </svg>
            )}
          </div>
          <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ width: '100%', marginTop: '1.25rem', accentColor: 'var(--dash-accent)' }} />

          {autosaveDebounceMs && isUploading && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem',
                        fontSize: '0.75rem', color: 'var(--dash-muted)' }}>
              <Loader2 size={12} className="animate-spin" /> Salvataggio...
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.75rem' }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                       padding: '0.5rem', borderRadius: 999, backgroundColor: 'transparent',
                       border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.8rem',
                       cursor: isUploading ? 'not-allowed' : 'pointer' }}>
              <Upload size={13} /> Carica nuova immagine
            </button>
            {onPickFromCollection && (
              <button type="button" onClick={onPickFromCollection} disabled={isUploading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                         padding: '0.5rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.8rem',
                         cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                <Images size={13} /> Raccolta immagini
              </button>
            )}
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
            {!hasNothingToCancel && (
              <button type="button" onClick={handleCancelCrop} disabled={isUploading}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.875rem', cursor: 'pointer' }}>
                Annulla
              </button>
            )}
            <button type="button" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} disabled={isUploading}
              title="Ripristina zoom e posizione"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                       width: 40, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                       border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', cursor: isUploading ? 'not-allowed' : 'pointer' }}>
              <RotateCcw size={15} />
            </button>
            {!autosaveDebounceMs && (
              <button type="button" onClick={handleConfirm} disabled={isUploading}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                         padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)', fontWeight: 600,
                         fontSize: '0.875rem', cursor: isUploading ? 'not-allowed' : 'pointer', opacity: isUploading ? 0.6 : 1 }}>
                {isUploading && <Loader2 size={14} className="animate-spin" />}
                {isUploading ? 'Caricamento...' : 'Conferma'}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
