import { useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { useAuth, supabase } from '../auth/AuthContext';

type Mode = 'signin' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
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

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.54 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
  </svg>
);

const socialProviders = [
  { id: 'google'   as const, label: 'Google',   Icon: GoogleIcon   },
  { id: 'facebook' as const, label: 'Facebook', Icon: FacebookIcon },
  { id: 'apple'    as const, label: 'Apple',    Icon: AppleIcon    },
  { id: 'discord'  as const, label: 'Discord',  Icon: DiscordIcon  },
];

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  if (!isOpen) return null;

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setPassword('');
  };

  const handleOAuth = async (provider: 'google' | 'facebook' | 'apple' | 'discord') => {
    if (provider !== 'google' && provider !== 'discord' && provider !== 'facebook') {
      console.log(`OAuth ${provider} non ancora configurato`);
      setOauthMessage('Funzione in arrivo');
      setTimeout(() => setOauthMessage(null), 2500);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setErrorMessage(`Errore durante l'accesso con ${provider}: ` + error.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('La password deve avere almeno 6 caratteri.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, displayName || undefined);
      if (result.error) setErrorMessage(translateError(result.error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) { setErrorMessage('Inserisci la tua email.'); return; }
    setErrorMessage(null);
    setIsResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) setErrorMessage(translateError(error.message));
      else setResetSent(true);
    } finally {
      setIsResetting(false);
    }
  };

  const exitResetMode = () => {
    setResetMode(false);
    setResetSent(false);
    setErrorMessage(null);
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
        {/* Chiudi */}
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none',
                   border: 'none', color: '#888', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={20} />
        </button>

        {resetMode ? (
          /* ── Vista recupero password ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h2 style={{ fontFamily: 'serif', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold',
                         textAlign: 'center', margin: 0 }}>
              Recupera password
            </h2>

            {!resetSent ? (
              <>
                <p style={{ color: '#aaa', fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
                  Inserisci la tua email, ti invieremo un link per reimpostare la password.
                </p>

                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="tu@esempio.com" autoComplete="email" style={inputStyle} />
                </div>

                {errorMessage && (
                  <div style={{ backgroundColor: 'rgba(180,30,30,0.2)', border: '1px solid rgba(200,50,50,0.4)',
                                borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: '#f8a0a0' }}>
                    {errorMessage}
                  </div>
                )}

                <button type="button" onClick={handleResetPassword} disabled={isResetting}
                  onMouseOver={e => { if (!isResetting) e.currentTarget.style.backgroundColor = 'rgba(201,160,78,0.12)'; }}
                  onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                           backgroundColor: 'transparent', border: '1.5px solid #c9a04e', borderRadius: 999,
                           padding: '0.65rem 1.5rem', color: '#c9a04e', fontSize: '0.9rem', fontWeight: 600,
                           cursor: isResetting ? 'not-allowed' : 'pointer', opacity: isResetting ? 0.6 : 1,
                           transition: 'background 0.2s', width: '100%' }}>
                  {isResetting && <Loader2 size={16} className="animate-spin" />}
                  {isResetting ? 'Invio in corso...' : 'Invia link di recupero'}
                </button>
              </>
            ) : (
              <div style={{ backgroundColor: 'rgba(30,120,60,0.2)', border: '1px solid rgba(50,180,80,0.4)',
                            borderRadius: 8, padding: '1rem', fontSize: '0.875rem',
                            color: '#a0f0b0', textAlign: 'center' }}>
                Email inviata! Controlla la tua casella di posta.
              </div>
            )}

            <button type="button" onClick={exitResetMode}
              style={{ background: 'none', border: 'none', color: '#888', fontSize: '0.85rem',
                       cursor: 'pointer', textAlign: 'center', padding: 0 }}>
              ← Torna al login
            </button>
          </div>
        ) : (
          /* ── Vista normale ── */
          <>
            {/* Titolo */}
            <h2 style={{ fontFamily: 'serif', color: '#fff', fontSize: '1.5rem', fontWeight: 'bold',
                         textAlign: 'center', marginBottom: '1.5rem' }}>
              {mode === 'signin' ? 'Accedi' : 'Crea account'}
            </h2>

            {/* Tab switcher */}
            <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999,
                          padding: '0.25rem', marginBottom: '1.75rem' }}>
              {(['signin', 'signup'] as Mode[]).map(m => (
                <button key={m} type="button" onClick={() => switchMode(m)}
                  style={{ flex: 1, borderRadius: 999, padding: '0.45rem 0', fontSize: '0.875rem',
                           fontWeight: 500, border: 'none', cursor: 'pointer',
                           transition: 'background 0.2s, color 0.2s',
                           backgroundColor: mode === m ? 'rgba(255,255,255,0.15)' : 'transparent',
                           color: mode === m ? '#fff' : '#888' }}>
                  {m === 'signin' ? 'Accedi' : 'Registrati'}
                </button>
              ))}
            </div>

            {/* Bottoni social */}
            <div>
              {socialProviders.map(({ id, label, Icon }) => (
                <button key={id} type="button" onClick={() => handleOAuth(id)}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)')}
                  onMouseOut={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)')}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 999,
                           backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                           color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                           gap: '0.6rem', cursor: 'pointer', marginBottom: '0.6rem',
                           transition: 'background 0.2s', fontSize: '0.875rem' }}>
                  <Icon />
                  Continua con {label}
                </button>
              ))}
            </div>

            {/* Messaggio OAuth coming soon */}
            {oauthMessage && (
              <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#c9a04e',
                            marginBottom: '0.5rem', marginTop: '-0.25rem' }}>
                {oauthMessage}
              </div>
            )}

            {/* Separatore OPPURE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
                          margin: '1.25rem 0', color: '#666', fontSize: '0.75rem' }}>
              <div style={{ flex: 1, height: 1, backgroundColor: '#333' }} />
              <span>OPPURE</span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#333' }} />
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Nome (solo signup) */}
              {mode === 'signup' && (
                <div>
                  <label style={labelStyle}>Nome (opzionale)</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="Il tuo nome o alias" autoComplete="name" style={inputStyle} />
                </div>
              )}

              {/* Email */}
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="tu@esempio.com" required autoComplete="email" style={inputStyle} />
              </div>

              {/* Password */}
              <div>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Minimo 6 caratteri' : '••••••••'}
                    required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%',
                             transform: 'translateY(-50%)', background: 'none', border: 'none',
                             color: '#888', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Password dimenticata (solo signin) */}
                {mode === 'signin' && (
                  <button type="button"
                    onClick={() => { setResetMode(true); setErrorMessage(null); }}
                    style={{ background: 'none', border: 'none', color: '#c9a04e', fontSize: '0.8rem',
                             cursor: 'pointer', textAlign: 'right', padding: 0,
                             marginTop: '0.35rem', display: 'block', marginLeft: 'auto' }}>
                    Password dimenticata?
                  </button>
                )}
              </div>

              {/* Errore */}
              {errorMessage && (
                <div style={{ backgroundColor: 'rgba(180,30,30,0.2)', border: '1px solid rgba(200,50,50,0.4)',
                              borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: '#f8a0a0' }}>
                  {errorMessage}
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
                {isSubmitting
                  ? (mode === 'signin' ? 'Accesso in corso...' : 'Registrazione in corso...')
                  : (mode === 'signin' ? 'Accedi' : 'Crea account')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function translateError(error: string): string {
  if (error.includes('Invalid login credentials')) return 'Email o password non corretti.';
  if (error.includes('Email not confirmed')) return 'Email non confermata. Controlla la tua casella.';
  if (error.includes('User already registered') || error.includes('already been registered'))
    return 'Questa email è già registrata. Prova ad accedere.';
  if (error.includes('Password should be at least')) return 'La password deve avere almeno 6 caratteri.';
  if (error.includes('Unable to validate email')) return 'Formato email non valido.';
  if (error.includes('rate limit')) return 'Troppi tentativi. Riprova tra qualche minuto.';
  return error;
}
