import { useState, useRef, useCallback } from 'react';
import { Loader2, X, Camera, Settings as SettingsIcon, UserCircle2 } from 'lucide-react';
import Cropper, { type Area } from 'react-easy-crop';
import { SupabaseDebug } from './SupabaseDebug';
import { useAuth, supabase } from '../auth/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { DashboardSettings } from '../../services/settings/dashboardSettings';

interface SettingsModalProps {
  draft: DashboardSettings;
  onChangeDraft: (updater: (previous: DashboardSettings) => DashboardSettings) => void;
  onSave: () => void;
  onCancel: () => void;
  initialTab?: 'general' | 'profile';
}

const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)',
  borderRadius: 10, padding: '0.65rem 1rem', color: 'var(--dash-text)', fontSize: '0.875rem',
  outline: 'none', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', color: 'var(--dash-muted)', marginBottom: '0.4rem',
};

const MAX_AVATAR_MB = 5;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

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

export function SettingsModal({ draft, onChangeDraft, onSave, onCancel, initialTab = 'general' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'profile'>(initialTab);
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user?.avatarUrl);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileError(null);
    if (!file.type.startsWith('image/')) {
      setProfileError('Seleziona un file immagine (JPG, PNG, WEBP...).');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setProfileError(`L'immagine non può superare i ${MAX_AVATAR_MB} MB.`);
      return;
    }
    setRawImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const confirmCrop = async () => {
    if (!rawImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedBlob(rawImageSrc, croppedAreaPixels);
      setCroppedBlob(blob);
      setAvatarPreview(URL.createObjectURL(blob));
      setRawImageSrc(null);
    } catch (err) {
      console.log('Errore ritaglio:', err);
      setProfileError('Errore durante il ritaglio. Riprova.');
      setRawImageSrc(null);
    }
  };

  const cancelCrop = () => {
    setRawImageSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => {
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta));
    });
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileError(null);
    setIsSavingProfile(true);
    try {
      let avatarUrl = user.avatarUrl ?? null;
      if (croppedBlob) {
        const filePath = `${user.id}/avatar-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, croppedBlob, { upsert: true, contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = publicUrl;
      }
      const trimmedName = displayName.trim();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: trimmedName || user.displayName, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;
      await refreshUser();
      onCancel();
    } catch (err) {
      console.log('Errore salvataggio profilo:', err);
      setProfileError('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ── Vista di ritaglio: sostituisce tutto il modal mentre attiva ──
  if (rawImageSrc) {
    return (
      <div data-dashboard-palette={draft.palette}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 1000,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div style={{ backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)',
                      borderRadius: 16, padding: '1.75rem', width: '100%', maxWidth: 420, fontFamily: 'sans-serif' }}>
          <h2 style={{ fontFamily: 'serif', color: 'var(--dash-text)', fontSize: '1.25rem', fontWeight: 'bold',
                       textAlign: 'center', marginBottom: '1rem' }}>
            Ritaglia immagine
          </h2>
          <div
            style={{ position: 'relative', width: '100%', height: 280, backgroundColor: '#000',
                      borderRadius: 12, overflow: 'hidden' }}
            onWheel={handleWheelZoom}
          >
            <Cropper
              image={rawImageSrc} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
              zoomWithScroll={false}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
            />
          </div>
          <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ width: '100%', marginTop: '1.25rem', accentColor: 'var(--dash-accent)' }} />
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" onClick={cancelCrop}
              style={{ flex: 1, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                       border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.875rem', cursor: 'pointer' }}>
              Annulla
            </button>
            <button type="button" onClick={confirmCrop}
              style={{ flex: 1, padding: '0.6rem', borderRadius: 999, backgroundColor: 'transparent',
                       border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)', fontWeight: 600,
                       fontSize: '0.875rem', cursor: 'pointer' }}>
              Conferma ritaglio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-dashboard-palette={draft.palette}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6 text-[var(--dash-text)] shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
              Impostazioni
            </div>
            <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
              {activeTab === 'general' ? 'Personalizzazione & Database' : 'Profilo utente'}
            </h3>
          </div>
        </div>

        {/* Tab */}
        <div className="mb-6 flex gap-2 border-b border-[var(--dash-border)]">
          <button type="button" onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
              activeTab === 'general'
                ? 'border-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'border-transparent text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}>
            <SettingsIcon className="h-4 w-4" /> Generale
          </button>
          <button type="button" onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
              activeTab === 'profile'
                ? 'border-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'border-transparent text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}>
            <UserCircle2 className="h-4 w-4" /> Profilo
          </button>
        </div>

        {activeTab === 'general' ? (
          <>
            <div className="space-y-6">
              <div className="border-b border-[var(--dash-border)] pb-5">
                <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Personalizzazione</h4>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-[var(--dash-text)]">Lingua</label>
                    <select value={draft.language} onChange={e => onChangeDraft(previous => ({ ...previous, language: e.target.value as DashboardSettings['language'] }))} className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]">
                      <option value="it">Italiano</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-[var(--dash-text)]">Palette</label>
                    <select value={draft.palette} onChange={e => onChangeDraft(previous => ({ ...previous, palette: e.target.value as DashboardSettings['palette'] }))} className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]">
                      <option value="noir">Hollow Gate</option>
                      <option value="questportal">Indaco Spettrale</option>
                      <option value="blood">Rosso Sangue</option>
                      <option value="amber">Ambra Antica</option>
                      <option value="emerald">Verde Occulto</option>
                      <option value="arcane">Blu Arcano</option>
                      <option value="cthulhu">Bracieri Antichi</option>
                      <option value="frost">Gelo Siderale</option>
                      <option value="violet">Violetto Cosmico</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="border-b border-[var(--dash-border)] pb-5">
                <h4 className="mb-3 text-sm font-medium text-[var(--dash-text-strong)]">Modalità salvataggio</h4>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <input type="radio" name="saveMode" value="cloud" checked={draft.saveMode === 'cloud'} onChange={() => onChangeDraft(previous => ({ ...previous, saveMode: 'cloud' }))} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--dash-text-strong)]">Cloud Supabase</span>
                      <span className="mt-1 block text-xs text-[var(--dash-muted)]">Usa Supabase come archivio principale, mantenendo il fallback locale già esistente.</span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                    <input type="radio" name="saveMode" value="local" checked={draft.saveMode === 'local'} onChange={() => onChangeDraft(previous => ({ ...previous, saveMode: 'local' }))} className="mt-1" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--dash-text-strong)]">Locale sul dispositivo</span>
                      <span className="mt-1 block text-xs text-[var(--dash-muted)]">Salva i dati sul dispositivo dell'utente. In questa fase prepara la dashboard al futuro salvataggio locale stabile.</span>
                    </span>
                  </label>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Database Supabase</h4>
                <SupabaseDebug />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--dash-border)] pt-4">
              <button type="button" onClick={onCancel} className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]">
                Esci senza salvare
              </button>
              <button type="button" onClick={onSave} className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]">
                Salva impostazioni
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
              <div style={{ position: 'relative', width: 88, height: 88 }}>
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ width: 88, height: 88, borderRadius: '50%', border: '2px solid var(--dash-border)',
                           background: 'var(--dash-surface)', cursor: 'pointer', padding: 0, overflow: 'hidden', display: 'block' }}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                                   width: '100%', height: '100%', color: 'var(--dash-muted)', fontSize: '2rem' }}>
                      {(displayName || '?').trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      onClick={() => fileInputRef.current?.click()}
                      style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28,
                               borderRadius: '50%', backgroundColor: 'var(--dash-accent)', display: 'flex',
                               alignItems: 'center', justifyContent: 'center', border: '2px solid var(--dash-bg)',
                               cursor: 'pointer' }}>
                      <Camera size={14} color="var(--dash-bg)" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right">Modifica immagine profilo</TooltipContent>
                </Tooltip>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Nome visualizzato</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="Il tuo nome o alias" style={inputStyle} />
            </div>

            {profileError && (
              <div style={{ backgroundColor: 'var(--dash-danger-bg)', border: '1px solid var(--dash-danger-border)',
                            borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: 'var(--dash-danger-text)',
                            marginBottom: '1rem' }}>
                {profileError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--dash-border)] pt-4">
              <button type="button" onClick={onCancel} disabled={isSavingProfile}
                className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]">
                Annulla
              </button>
              <button type="button" onClick={handleSaveProfile} disabled={isSavingProfile}
                className="flex items-center gap-2 rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:cursor-not-allowed disabled:opacity-60">
                {isSavingProfile && <Loader2 size={14} className="animate-spin" />}
                {isSavingProfile ? 'Salvataggio...' : 'Salva profilo'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
