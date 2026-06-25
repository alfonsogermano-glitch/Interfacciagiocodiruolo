import { useState, useEffect } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../auth/AuthContext';

const ADMIN_USER_ID = '3c298159-e7d1-4507-ad06-b44765968162';

interface NewsPost {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', backgroundColor: '#000', color: '#e5e5e5', fontFamily: 'sans-serif',
  padding: '3rem 1.5rem',
};
const containerStyle: React.CSSProperties = { maxWidth: 680, margin: '0 auto' };
const inputStyle: React.CSSProperties = {
  width: '100%', backgroundColor: '#111', border: '1px solid #333', borderRadius: 10,
  padding: '0.6rem 0.875rem', color: '#fff', fontSize: '0.9rem', outline: 'none',
  boxSizing: 'border-box', fontFamily: 'inherit',
};

export function NewsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userId === ADMIN_USER_ID;

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    void loadPosts();
  }, []);

  const handlePublish = async () => {
    if (!title.trim() || !body.trim()) return;
    setIsPublishing(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('news_posts')
        .insert({ title: title.trim(), body: body.trim(), author_id: userId });
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
    <div style={pageStyle}>
      <div style={containerStyle}>
        <a href="/" style={{ color: '#c9a04e', fontSize: '0.85rem', textDecoration: 'none' }}>
          ← Torna a Hollow Gate
        </a>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1.5rem 0 2rem' }}>
          <h1 style={{ fontFamily: 'serif', fontSize: '2rem', fontWeight: 'bold', color: '#fff' }}>
            News e Novità
          </h1>
          {isAdmin && !showCompose && (
            <button type="button" onClick={() => setShowCompose(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem',
                       borderRadius: 999, backgroundColor: 'transparent', border: '1.5px solid #c9a04e',
                       color: '#c9a04e', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={14} /> Nuova news
            </button>
          )}
        </div>

        {isAdmin && showCompose && (
          <div style={{ border: '1px solid #333', borderRadius: 12, padding: '1.25rem', marginBottom: '2rem' }}>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Titolo" style={{ ...inputStyle, marginBottom: '0.75rem' }} />
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder="Testo della novità..." rows={5}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} />
            {error && <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#f8a0a0' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
              <button type="button" onClick={() => { setShowCompose(false); setTitle(''); setBody(''); setError(null); }}
                disabled={isPublishing}
                style={{ flex: 1, padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid #444', color: '#aaa', fontSize: '0.8rem', cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button" onClick={handlePublish} disabled={isPublishing || !title.trim() || !body.trim()}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                         padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid #c9a04e', color: '#c9a04e', fontWeight: 600, fontSize: '0.8rem',
                         cursor: (isPublishing || !title.trim() || !body.trim()) ? 'not-allowed' : 'pointer',
                         opacity: (isPublishing || !title.trim() || !body.trim()) ? 0.5 : 1 }}>
                {isPublishing && <Loader2 size={14} className="animate-spin" />}
                {isPublishing ? 'Pubblicazione...' : 'Pubblica'}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: '#666' }} />
          </div>
        ) : posts.length === 0 ? (
          <p style={{ color: '#666', textAlign: 'center', padding: '2rem 0', fontSize: '0.9rem' }}>
            Nessuna novità pubblicata ancora.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {posts.map(post => (
              <div key={post.id} style={{ borderBottom: '1px solid #222', paddingBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#c9a04e', marginBottom: '0.3rem' }}>
                      {formatDate(post.created_at)}
                    </div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#fff' }}>{post.title}</h2>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => handleDelete(post.id)} aria-label="Elimina"
                      style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '0.25rem' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <p style={{ marginTop: '0.6rem', fontSize: '0.9rem', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
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
