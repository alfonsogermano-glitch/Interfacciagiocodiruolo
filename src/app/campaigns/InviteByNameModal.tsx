import { useState } from 'react';
import { X, Loader2, Send, Check } from 'lucide-react';
import { useCampaign } from './CampaignContext';

interface InviteByNameModalProps {
  campaignId: string;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)', borderRadius: 16,
  padding: '2.25rem', width: '100%', maxWidth: 420, position: 'relative', fontFamily: 'sans-serif',
};
const closeButtonStyle: React.CSSProperties = {
  position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none',
  color: 'var(--dash-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem',
};
const titleStyle: React.CSSProperties = {
  fontFamily: 'serif', color: 'var(--dash-text)', fontSize: '1.4rem', fontWeight: 'bold',
  textAlign: 'center', marginBottom: '1.5rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)',
  borderRadius: 10, padding: '0.75rem 1rem', color: 'var(--dash-text)', fontSize: '0.875rem',
  outline: 'none', boxSizing: 'border-box',
};

export function InviteByNameModal({ campaignId, onClose }: InviteByNameModalProps) {
  const { inviteByName } = useCampaign();
  const [displayName, setDisplayName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmed = displayName.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      await inviteByName(campaignId, trimmed);
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invio non riuscito. Riprova.');
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
            <h2 style={titleStyle}>Invito inviato!</h2>
            <p style={{ color: 'var(--dash-muted)', textAlign: 'center', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Check size={16} className="text-[var(--dash-accent)]" /> In attesa che {displayName.trim()} accetti.
            </p>
          </>
        ) : (
          <>
            <h2 style={titleStyle}>Invita per nome</h2>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--dash-muted)', marginBottom: '0.4rem' }}>
              Nome visualizzato esatto
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Es. Mario"
              autoFocus
              style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') void handleSend(); }}
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
              <button type="button" onClick={handleSend} disabled={isSending || !displayName.trim()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                         padding: '0.65rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)',
                         fontSize: '0.875rem', fontWeight: 600,
                         cursor: (isSending || !displayName.trim()) ? 'not-allowed' : 'pointer',
                         opacity: (isSending || !displayName.trim()) ? 0.5 : 1 }}>
                {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {isSending ? 'Invio...' : 'Invia invito'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
