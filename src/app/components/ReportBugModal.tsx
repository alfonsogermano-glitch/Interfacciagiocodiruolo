import { useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { projectId, publicAnonKey } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

interface ReportBugModalProps {
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)', borderRadius: 16,
  padding: '2.25rem', width: '100%', maxWidth: 460, position: 'relative', fontFamily: 'sans-serif',
};
const closeButtonStyle: React.CSSProperties = {
  position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none',
  color: 'var(--dash-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem',
};
const titleStyle: React.CSSProperties = {
  fontFamily: 'serif', color: 'var(--dash-text)', fontSize: '1.4rem', fontWeight: 'bold',
  textAlign: 'center', marginBottom: '1.5rem',
};
const textareaStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)',
  borderRadius: 10, padding: '0.75rem 1rem', color: 'var(--dash-text)', fontSize: '0.875rem',
  outline: 'none', resize: 'vertical', minHeight: 130, fontFamily: 'inherit', boxSizing: 'border-box',
};

export function ReportBugModal({ onClose }: ReportBugModalProps) {
  const { user, session } = useAuth();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const accessToken = session?.access_token ?? publicAnonKey;
      const res = await fetch(`${SERVER_BASE}/report-bug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: message.trim(), displayName: user?.displayName, email: user?.email }),
      });
      if (!res.ok) throw new Error('Invio fallito');
      setSent(true);
    } catch (err) {
      console.log('Errore invio report bug:', err);
      setError('Invio non riuscito. Riprova.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Chiudi" style={closeButtonStyle}>
          <X size={20} />
        </button>

        {sent ? (
          <>
            <h2 style={titleStyle}>Grazie!</h2>
            <p style={{ color: 'var(--dash-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
              Il tuo report è stato inviato. Grazie per l&apos;aiuto a migliorare Hollow Gate.
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
              <button type="button" onClick={onClose}
                style={{ padding: '0.6rem 1.5rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)',
                         fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                Chiudi
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={titleStyle}>Segnala un bug</h2>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Descrivi cosa è successo, cosa ti aspettavi e come riprodurlo..."
              style={textareaStyle}
            />
            {error && (
              <div style={{ backgroundColor: 'var(--dash-danger-bg)', border: '1px solid var(--dash-danger-border)',
                            borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: '0.8rem',
                            color: 'var(--dash-danger-text)', marginTop: '0.75rem' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" onClick={onClose} disabled={isSending}
                style={{ flex: 1, padding: '0.65rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)',
                         fontSize: '0.875rem', cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button" onClick={handleSend} disabled={isSending || !message.trim()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                         padding: '0.65rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)',
                         fontSize: '0.875rem', fontWeight: 600,
                         cursor: (isSending || !message.trim()) ? 'not-allowed' : 'pointer',
                         opacity: (isSending || !message.trim()) ? 0.5 : 1 }}>
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isSending ? 'Invio...' : 'Invia report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
