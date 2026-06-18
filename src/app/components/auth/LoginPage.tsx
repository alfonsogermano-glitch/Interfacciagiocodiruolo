import { useState } from 'react';
import { Eye, EyeOff, Loader2, Skull } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

type Mode = 'signin' | 'signup';

interface LoginPageProps {
  onGoBack: () => void;
}

export function LoginPage({ onGoBack }: LoginPageProps) {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let result: { error: string | null };

      if (mode === 'signin') {
        result = await signIn(email, password);
      } else {
        if (password.length < 6) {
          setErrorMessage('La password deve avere almeno 6 caratteri.');
          return;
        }
        result = await signUp(email, password, displayName || undefined);
      }

      if (result.error) {
        setErrorMessage(translateError(result.error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setPassword('');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--dash-bg)] px-4">
      {/* Back link */}
      <div className="absolute left-6 top-5">
        <button
          type="button"
          onClick={onGoBack}
          className="flex items-center gap-1.5 text-sm text-[var(--dash-muted)] transition-colors hover:text-[var(--dash-text)]"
        >
          ← Torna alla home
        </button>
      </div>

      {/* Logo / Title */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--dash-accent)] bg-[var(--dash-surface-2)] shadow-[0_0_32px_var(--dash-accent)]/30">
          <Skull className="h-8 w-8 text-[var(--dash-accent)]" />
        </div>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-[var(--dash-text-strong)]">
          Hollow Gate
        </h1>
        <p className="max-w-xs text-sm text-[var(--dash-muted)]">
          {mode === 'signin'
            ? 'Accedi per gestire le tue campagne.'
            : 'Crea un account per iniziare.'}
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-8 shadow-2xl">
        {/* Mode tabs */}
        <div className="mb-6 flex rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signin'
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            Accedi
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              mode === 'signup'
                ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
                : 'text-[var(--dash-muted)] hover:text-[var(--dash-text)]'
            }`}
          >
            Registrati
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name (solo signup) */}
          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-sm text-[var(--dash-text)]">
                Nome (opzionale)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Il tuo nome o alias"
                autoComplete="name"
                className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none transition-colors focus:border-[var(--dash-accent)]"
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="mb-1.5 block text-sm text-[var(--dash-text)]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@esempio.com"
              required
              autoComplete={mode === 'signin' ? 'email' : 'email'}
              className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none transition-colors focus:border-[var(--dash-accent)]"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm text-[var(--dash-text)]">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Minimo 6 caratteri' : '••••••••'}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 pr-11 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none transition-colors focus:border-[var(--dash-accent)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dash-muted)] hover:text-[var(--dash-text)]"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Errore */}
          {errorMessage && (
            <div className="rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
              {errorMessage}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-3 text-sm font-semibold text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)] disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting
              ? mode === 'signin' ? 'Accesso in corso...' : 'Registrazione in corso...'
              : mode === 'signin' ? 'Accedi' : 'Crea account'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs text-[var(--dash-muted)]">
        Hollow Gate · High School Cthulhu VTT
      </p>
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
