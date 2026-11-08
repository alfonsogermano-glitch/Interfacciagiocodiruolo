import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-react';
import { supabase } from '../auth/AuthContext';

interface ChangePasswordModalProps {
  email: string;
  onClose: () => void;
}

function passwordError(message: string) {
  if (message.includes('Invalid login credentials')) return 'La password attuale non è corretta.';
  if (message.includes('New password should be different')) return 'La nuova password deve essere diversa da quella attuale.';
  if (message.includes('Password should be at least')) return 'La password deve avere almeno 6 caratteri.';
  return message;
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="block space-y-1.5 text-sm font-medium text-[var(--dash-text)]">
    <span>{label}</span>
    <span className="relative block">
      <input type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} required className="w-full rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface-2)] px-3 py-2.5 pr-10 text-[var(--dash-text-strong)] outline-none transition focus:border-[var(--dash-accent)] focus:ring-2 focus:ring-[var(--dash-accent)]/20" />
      <button type="button" tabIndex={-1} aria-label={visible ? 'Nascondi password' : 'Mostra password'} onClick={() => setVisible(current => !current)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--dash-muted)] hover:text-[var(--dash-text-strong)]">
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  </label>;
}

export function ChangePasswordModal({ email, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !submitting) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 6) return setError('La password deve avere almeno 6 caratteri.');
    if (newPassword !== confirmPassword) return setError('Le due nuove password non coincidono.');
    if (newPassword === currentPassword) return setError('La nuova password deve essere diversa da quella attuale.');
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInError) return setError(passwordError(signInError.message));
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) return setError(passwordError(updateError.message));
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[10050] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="relative w-full max-w-md rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-6 text-[var(--dash-text)] shadow-2xl">
      <button type="button" aria-label="Chiudi" disabled={submitting} onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] disabled:opacity-40"><X className="h-5 w-5" /></button>
      <div className="mb-5 flex items-center gap-3 pr-8"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--dash-accent)]/15 text-[var(--dash-accent)]"><KeyRound className="h-5 w-5" /></span><div><h2 id="change-password-title" className="text-lg font-bold text-[var(--dash-text-strong)]">Modifica password</h2><p className="text-xs text-[var(--dash-muted)]">Aggiorna la password di accesso al sito.</p></div></div>
      {success ? <div className="space-y-4"><div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span>La password è stata aggiornata correttamente.</span></div><button type="button" onClick={onClose} className="w-full rounded-lg bg-[var(--dash-accent)] px-4 py-2.5 font-semibold text-slate-950 hover:brightness-110">Chiudi</button></div> : <form onSubmit={submit} className="space-y-4">
        <PasswordField label="Password attuale" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordField label="Nuova password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
        <PasswordField label="Conferma nuova password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
        {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--dash-accent)] px-4 py-2.5 font-semibold text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? 'Aggiornamento...' : 'Aggiorna password'}</button>
      </form>}
    </div>
  </div>;
}
