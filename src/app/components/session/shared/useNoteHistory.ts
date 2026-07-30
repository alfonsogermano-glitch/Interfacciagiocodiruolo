import { useState } from 'react';
import { projectId } from '/utils/supabase/info';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

export interface NoteHistoryVersion {
  id: string;
  note_id: string;
  campaign_id: string | null;
  content: string | null;
  content_rich: any;
  saved_by_profile_id: string | null;
  created_at: string;
}

export interface UseNoteHistoryParams {
  noteId: string | null;
  accessToken: string | null | undefined;
}

// A differenza di useNotesTrash.ts, nessuna sottoscrizione realtime: la
// cronologia e' "guarda indietro" per UNA nota alla volta (non una vista
// collaborativa condivisa come il Cestino) - fetch on-demand quando il
// pannello si apre e' sufficiente (vedi piano approvato, Fase 2). Per lo
// stesso motivo fetchHistory NON e' chiamata automaticamente in un
// useEffect qui: il chiamante (pannello Cronologia, Fase 3) decide quando
// serve davvero (all'apertura), non ad ogni mount/cambio di noteId.
export function useNoteHistory({ noteId, accessToken }: UseNoteHistoryParams) {
  const [versions, setVersions] = useState<NoteHistoryVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = async () => {
    if (!noteId) {
      setVersions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${noteId}/history`, {
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      const data = await res.json();
      if (!res.ok) return;
      setVersions(data.history ?? []);
    } catch (err) {
      console.error('Errore caricamento cronologia nota:', err);
    } finally {
      setLoading(false);
    }
  };

  // Ritorna la nota aggiornata (content/content_rich ripristinati) cosi'
  // il chiamante puo' riflettere il cambio nello stato locale della tab
  // (vedi useEntityTabs.ts, Fase 3) senza un reload - null se fallisce.
  // Non aggiorna `versions` da solo: il ripristino stesso crea una nuova
  // voce di cronologia lato server (snapshotNoteHistory con force:true,
  // la versione pre-ripristino), il chiamante richiama fetchHistory() se
  // vuole vederla comparire in lista.
  const restoreVersion = async (historyId: string): Promise<{ id: string; content: string | null; content_rich: any } | null> => {
    if (!noteId) return null;
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${noteId}/history/${historyId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Restore fallito');
      return data.note ?? null;
    } catch (err) {
      console.error('Errore ripristino versione nota:', err);
      return null;
    }
  };

  return { versions, loading, fetchHistory, restoreVersion };
}
