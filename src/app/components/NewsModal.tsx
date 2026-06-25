import { useState, useEffect } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth, supabase } from '../auth/AuthContext';
import type { DashboardPalette } from '../../services/settings/dashboardSettings';

const ADMIN_USER_ID = '3c298159-e7d1-4507-ad06-b44765968162';

interface NewsPost {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

interface NewsModalProps {
  onClose: () => void;
  palette: DashboardPalette;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
};
const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--dash-bg)', border: '1px solid var(--dash-border-soft)', borderRadius: 16,
  padding: '2rem', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto',
  position: 'relative', fontFamily: 'sans-serif',
};
const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--dash-surface)', border: '1px solid var(--dash-border)',
  borderRadius: 10, padding: '0.6rem 0.875rem', color: 'var(--dash-text)', fontSize: '0.875rem',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NewsModal({ onClose, palette }: NewsModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_USER_ID;

  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = async () => {
    setIsLoading(true);
    const { data, error: fetchError } = await supabase
      .from('news_posts')
      .select('id, title, body, created_at')
      .order('created_at', { ascending: false });
    if (fetchError) {
      console.log('Errore caricamento news:', fetchError.message);
    } else {
      setPosts(data ?? []);
    }
    setIsLoading(false);
  };

  useEffect(() => { void loadPosts(); }, []);

  const handlePublish = async () => {
    if (!title.trim() || !body.trim()) return;
    setIsPublishing(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('news_posts')
        .insert({ title: title.trim(), body: body.trim(), author_id: user?.id });
      if (insertError) throw insertError;
      setTitle('');
      setBody('');
      setShowCompose(false);
      await loadPosts();
    } catch (err) {
      console.log('Errore pubblicazione news:', err);
      setError('Pubblicazione non riuscita. Riprova.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error: deleteError } = await supabase.from('news_posts').delete().eq('id', id);
    if (deleteError) {
      console.log('Errore eliminazione news:', deleteError.message);
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div data-dashboard-palette={palette} style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Chiudi"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none',
                   color: 'var(--dash-muted)', cursor: 'pointer', display: 'flex', padding: '0.25rem' }}>
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'serif', color: 'var(--dash-text)', fontSize: '1.5rem', fontWeight: 'bold' }}>
            News e Novità
          </h2>
          {isAdmin && !showCompose && (
            <button type="button" onClick={() => setShowCompose(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.9rem',
                       borderRadius: 999, backgroundColor: 'transparent', border: '1.5px solid var(--dash-accent)',
                       color: 'var(--dash-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={14} /> Nuova news
            </button>
          )}
        </div>

        {isAdmin && showCompose && (
          <div style={{ border: '1px solid var(--dash-border-soft)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Titolo" style={{ ...inputStyle, marginBottom: '0.75rem' }} />
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Testo della novità..." rows={5}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} />
            {error && (
              <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--dash-danger-text)' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
              <button type="button" onClick={() => { setShowCompose(false); setTitle(''); setBody(''); setError(null); }}
                disabled={isPublishing}
                style={{ flex: 1, padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid var(--dash-border)', color: 'var(--dash-muted)', fontSize: '0.8rem', cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button" onClick={handlePublish} disabled={isPublishing || !title.trim() || !body.trim()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                         padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid var(--dash-accent)', color: 'var(--dash-accent)', fontWeight: 600,
                         fontSize: '0.8rem', cursor: (isPublishing || !title.trim() || !body.trim()) ? 'not-allowed' : 'pointer',
                         opacity: (isPublishing || !title.trim() || !body.trim()) ? 0.5 : 1 }}>
                {isPublishing && <Loader2 size={14} className="animate-spin" />}
                {isPublishing ? 'Pubblicazione...' : 'Pubblica'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--dash-muted)' }} />
          </div>
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--dash-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>
            Nessuna novità pubblicata ancora.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {posts.map(post => (
              <div key={post.id} style={{ borderBottom: '1px solid var(--dash-border-soft)', paddingBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--dash-accent-2)', marginBottom: '0.25rem' }}>
                      {formatDate(post.created_at)}
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--dash-text-strong)' }}>
                      {post.title}
                    </h3>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => handleDelete(post.id)} aria-label="Elimina"
                      style={{ background: 'none', border: 'none', color: 'var(--dash-muted)', cursor: 'pointer', padding: '0.25rem' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--dash-text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {post.body}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
