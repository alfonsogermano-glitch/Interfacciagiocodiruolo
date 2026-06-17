import { useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { supabase } from '../auth/AuthContext';

function translateError(error: string): string {
  if (error.includes('New password should be different from the old password'))
    return 'La nuova password deve essere diversa da quella attuale.';
  if (error.includes('Password should be at least'))
    return 'La password deve avere almeno 6 caratteri.';
  if (error.includes('Unable to validate email'))
    return 'Email non valida.';
  return error;
}

interface SetNewPasswordModalProps {
  onComplete: () => void;
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

export function SetNewPasswordModal({ onComplete }: SetNewPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('La password deve avere almeno 6 caratteri.');
      return;
    }
    if (password !== confirm) {
      setError('Le due password non coincidono.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(translateError(updateError.message));
      } else {
        setSuccess(true);
        setTimeout(onComplete, 2000);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 1000,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      {/* Logo sfondo */}
      <img
        src="/hollowgate-logo.png"
        alt=""
        style={{ position: 'absolute', top: '50%', left: '50%',
                 transform: 'translate(-50%, -50%)', height: '85%', width: 'auto',
                 objectFit: 'contain', opacity: 0.65,
                 filter: 'brightness(1.8) contrast(1.1)',
                 zIndex: 0, pointerEvents: 'none' }}
      />
      <div
        style={{ backgroundColor: '#0a0a0a', border: '1px solid #333', borderRadius: 16,
                 padding: '2.5rem', width: '100%', maxWidth: 420, position: 'relative', zIndex: 1,
                 fontFamily: 'sans-serif' }}
      >
        {/* Chiudi — porta comunque alla dashboard */}
        <button type="button" onClick={onComplete} aria-label="Chiudi"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none',
                   border: 'none', color: '#888', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={20} />
        </button>

        {success ? (
          /* Vista successo */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '1rem 0' }}>
            <h2 style={{ fontFamily: 'serif', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold',
                         textAlign: 'center', margin: 0 }}>
              Password aggiornata!
            </h2>
            <div style={{ backgroundColor: 'rgba(30,120,60,0.2)', border: '1px solid rgba(50,180,80,0.4)',
                          borderRadius: 8, padding: '1rem', fontSize: '0.875rem',
                          color: '#a0f0b0', textAlign: 'center', width: '100%' }}>
              La tua password è stata aggiornata con successo. Reindirizzamento in corso...
            </div>
          </div>
        ) : (
          /* Vista form */
          <>
            <h2 style={{ fontFamily: 'serif', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold',
                         textAlign: 'center', marginBottom: '0.5rem' }}>
              Imposta nuova password
            </h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.75rem' }}>
              Scegli una nuova password per il tuo account.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Nuova password */}
              <div>
                <label style={labelStyle}>Nuova password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimo 6 caratteri"
                    required
                    autoComplete="new-password"
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%',
                             transform: 'translateY(-50%)', background: 'none', border: 'none',
                             color: '#888', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Conferma password */}
              <div>
                <label style={labelStyle}>Conferma password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Ripeti la password"
                    required
                    autoComplete="new-password"
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%',
                             transform: 'translateY(-50%)', background: 'none', border: 'none',
                             color: '#888', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Errore */}
              {error && (
                <div style={{ backgroundColor: 'rgba(180,30,30,0.2)', border: '1px solid rgba(200,50,50,0.4)',
                              borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: '#f8a0a0' }}>
                  {error}
                </div>
              )}

              {/* Submit dorato */}
              <button type="submit" disabled={isSubmitting}
                onMouseOver={e => { if (!isSubmitting) e.currentTarget.style.backgroundColor = 'rgba(201,160,78,0.12)'; }}
                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center',
                         justifyContent: 'center', gap: '0.5rem', backgroundColor: 'transparent',
                         border: '1.5px solid #c9a04e', borderRadius: 999, padding: '0.65rem 1.5rem',
                         color: '#c9a04e', fontSize: '0.9rem', fontWeight: 600,
                         cursor: isSubmitting ? 'not-allowed' : 'pointer',
                         opacity: isSubmitting ? 0.6 : 1, transition: 'background 0.2s', width: '100%' }}>
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? 'Salvataggio...' : 'Salva nuova password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
