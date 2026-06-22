import { useState, useRef } from 'react';
import { Loader2, X, Camera } from 'lucide-react';
import { useAuth, supabase } from '../auth/AuthContext';

interface EditProfileModalProps {
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#111',
  border: '1px solid #444',
  borderRadius: 10,
  padding: '0.65rem 1rem',
  color: '#fff',
  fontSize: '0.875rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  color: '#aaa',
  marginBottom: '0.4rem',
};

const MAX_AVATAR_MB = 5;

export function EditProfileModal({ onClose }: EditProfileModalProps) {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user?.avatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Seleziona un file immagine (JPG, PNG, WEBP...).');
      return;
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      setErrorMessage(`L'immagine non può superare i ${MAX_AVATAR_MB} MB.`);
      return;
    }

    setSelectedFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user) return;
    setErrorMessage(null);
    setIsSaving(true);
    try {
      let avatarUrl = user.avatarUrl ?? null;

      if (selectedFile) {
        const ext = selectedFile.name.split('.').pop() ?? 'png';
        const filePath = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, selectedFile, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);
        avatarUrl = publicUrl;
      }

      const trimmedName = displayName.trim();
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: trimmedName || user.displayName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (updateError) throw updateError;

      await refreshUser();
      onClose();
    } catch (err) {
      console.log('Errore salvataggio profilo:', err);
      setErrorMessage('Errore durante il salvataggio. Riprova.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 16,
                 padding: '2.5rem', width: '100%', maxWidth: 420, position: 'relative',
                 fontFamily: 'sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none',
                   border: 'none', color: '#888', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={20} />
        </button>

        <h2 style={{ fontFamily: 'serif', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold',
                     textAlign: 'center', marginBottom: '1.75rem' }}>
          Modifica profilo
        </h2>

        {/* Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            style={{ position: 'relative', width: 88, height: 88, borderRadius: '50%',
                     border: '2px solid #444', background: '#111', cursor: 'pointer',
                     padding: 0, overflow: 'hidden' }}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                             width: '100%', height: '100%', color: '#666', fontSize: '2rem' }}>
                {(displayName || '?').trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28,
                           borderRadius: '50%', backgroundColor: '#c9a04e', display: 'flex',
                           alignItems: 'center', justifyContent: 'center', border: '2px solid #0a0a0a' }}>
              <Camera size={14} color="#0a0a0a" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange}
            style={{ display: 'none' }} />
        </div>

        {/* Nome */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={labelStyle}>Nome visualizzato</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Il tuo nome o alias" style={inputStyle} />
        </div>

        {errorMessage && (
          <div style={{ backgroundColor: 'rgba(180,30,30,0.2)', border: '1px solid rgba(200,50,50,0.4)',
                        borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: '#f8a0a0',
                        marginBottom: '1rem' }}>
            {errorMessage}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" onClick={onClose} disabled={isSaving}
            style={{ flex: 1, padding: '0.65rem', borderRadius: 999, backgroundColor: 'transparent',
                     border: '1px solid #444', color: '#aaa', fontSize: '0.875rem', cursor: 'pointer' }}>
            Annulla
          </button>
          <button type="button" onClick={handleSave} disabled={isSaving}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                     gap: '0.5rem', padding: '0.65rem', borderRadius: 999, backgroundColor: 'transparent',
                     border: '1.5px solid #c9a04e', color: '#c9a04e', fontSize: '0.875rem',
                     fontWeight: 600, cursor: isSaving ? 'not-allowed' : 'pointer',
                     opacity: isSaving ? 0.6 : 1 }}>
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            {isSaving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
