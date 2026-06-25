import { useState, useEffect, useRef } from 'react';
import { Loader2, Plus, Trash2, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '../auth/AuthContext';

const ADMIN_USER_ID = '3c298159-e7d1-4507-ad06-b44765968162';
const MAX_IMAGE_MB = 5;

type ContentBlock = { type: 'text'; text: string } | { type: 'image'; url: string };

interface NewsPost {
  id: string;
  title: string;
  content: ContentBlock[];
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
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userId === ADMIN_USER_ID;

  const loadPosts = async () => {
    setIsLoading(true);
    const { data, error: fetchError } = await supabase
      .from('news_posts')
      .select('id, title, content, created_at')
      .order('created_at', { ascending: false });
    if (fetchError) {
      console.log('Errore caricamento news:', fetchError.message);
    } else {
      setPosts((data ?? []) as NewsPost[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    void loadPosts();
  }, []);

  const addTextBlock = () => {
    if (!currentText.trim()) return;
    setBlocks(prev => [...prev, { type: 'text', text: currentText.trim() }]);
    setCurrentText('');
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Seleziona un file immagine.');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`L'immagine non può superare i ${MAX_IMAGE_MB} MB.`);
      return;
    }
    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('news-images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('news-images').getPublicUrl(path);
      setBlocks(prev => [...prev, { type: 'image', url: publicUrl }]);
    } catch (err) {
      console.log('Errore upload immagine:', err);
      setError('Caricamento immagine non riuscito. Riprova.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const resetCompose = () => {
    setShowCompose(false);
    setTitle('');
    setBlocks([]);
    setCurrentText('');
    setError(null);
  };

  const handlePublish = async () => {
    const finalBlocks = currentText.trim()
      ? [...blocks, { type: 'text' as const, text: currentText.trim() }]
      : blocks;
    if (!title.trim() || finalBlocks.length === 0) return;
    setIsPublishing(true);
    setError(null);
    try {
      const { error: insertError } = await supabase
        .from('news_posts')
        .insert({ title: title.trim(), content: finalBlocks, author_id: userId });
      if (insertError) throw insertError;
      resetCompose();
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
        <button type="button" onClick={() => window.close()}
          style={{ background: 'none', border: 'none', color: '#c9a04e', fontSize: '0.85rem',
                   cursor: 'pointer', padding: 0 }}>
          ← Torna a Hollow Gate
        </button>

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
              placeholder="Titolo" style={{ ...inputStyle, marginBottom: '1rem' }} />

            {blocks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                {blocks.map((block, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem',
                                          border: '1px solid #292929', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
                    {block.type === 'text' ? (
                      <p style={{ flex: 1, fontSize: '0.8rem', color: '#ccc', margin: 0,
                                  whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                        {block.text}
                      </p>
                    ) : (
                      <img src={block.url} alt="" style={{ height: 50, borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <button type="button" onClick={() => removeBlock(i)} aria-label="Rimuovi blocco"
                      style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', flexShrink: 0 }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <textarea value={currentText} onChange={e => setCurrentText(e.target.value)}
              placeholder="Scrivi un paragrafo..." rows={4}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
              <button type="button" onClick={addTextBlock} disabled={!currentText.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem',
                         borderRadius: 999, backgroundColor: 'transparent', border: '1px solid #444',
                         color: currentText.trim() ? '#ccc' : '#555', fontSize: '0.78rem',
                         cursor: currentText.trim() ? 'pointer' : 'not-allowed' }}>
                <Plus size={13} /> Aggiungi paragrafo
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingImage}
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.8rem',
                         borderRadius: 999, backgroundColor: 'transparent', border: '1px solid #444',
                         color: '#ccc', fontSize: '0.78rem', cursor: 'pointer' }}>
                {isUploadingImage ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
                {isUploadingImage ? 'Caricamento...' : 'Aggiungi immagine'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
            </div>

            {error && <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#f8a0a0' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.25rem', borderTop: '1px solid #292929', paddingTop: '1rem' }}>
              <button type="button" onClick={resetCompose} disabled={isPublishing}
                style={{ flex: 1, padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1px solid #444', color: '#aaa', fontSize: '0.8rem', cursor: 'pointer' }}>
                Annulla
              </button>
              <button type="button" onClick={handlePublish}
                disabled={isPublishing || !title.trim() || (blocks.length === 0 && !currentText.trim())}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                         padding: '0.55rem', borderRadius: 999, backgroundColor: 'transparent',
                         border: '1.5px solid #c9a04e', color: '#c9a04e', fontWeight: 600, fontSize: '0.8rem',
                         cursor: 'pointer', opacity: isPublishing ? 0.6 : 1 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
            {posts.map(post => (
              <div key={post.id} style={{ borderBottom: '1px solid #222', paddingBottom: '2rem' }}>
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
                <div style={{ marginTop: '0.75rem' }}>
                  {(post.content ?? []).map((block, i) =>
                    block.type === 'text' ? (
                      <p key={i} style={{ fontSize: '0.9rem', color: '#ccc', whiteSpace: 'pre-wrap',
                                            lineHeight: 1.7, marginBottom: '1rem' }}>
                        {block.text}
                      </p>
                    ) : (
                      <img key={i} src={block.url} alt=""
                        onClick={() => setLightboxUrl(block.url)}
                        style={{ width: '100%', borderRadius: 10, marginBottom: '1rem', display: 'block', cursor: 'zoom-in' }} />
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 2000,
                   display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
                   cursor: 'zoom-out' }}
        >
          <button type="button" onClick={() => setLightboxUrl(null)} aria-label="Chiudi"
            style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none',
                     color: '#ccc', cursor: 'pointer', display: 'flex', padding: '0.4rem' }}>
            <X size={26} />
          </button>
          <img src={lightboxUrl} alt=""
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain', cursor: 'zoom-out' }} />
        </div>
      )}
    </div>
  );
}
