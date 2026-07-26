import { useEffect, useState } from 'react';
import { projectId } from '/utils/supabase/info';
import { useCampaignChannel } from '../../../../services/realtime/campaignChannel';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

// Stesso scope del server (vedi supabase-add-notes-trash.sql e la sezione
// "Cestino Note" in supabase/functions/server/index.tsx): solo Note
// Campagna/GM (entity_type 'campaign'/'note') e le loro cartelle
// ('gmnotes'/'campaignnotes'). PG/PNG/Mostro non hanno cestino.
const NOTE_TRASH_TYPES = ['campaign', 'note'];
const FOLDER_TRASH_TYPES = ['gmnotes', 'campaignnotes'];

export interface TrashedNote {
  id: string;
  tab_name: string;
  entity_type: 'campaign' | 'note';
  hidden: boolean;
  deleted_at: string;
}

export interface TrashedFolder {
  id: string;
  name: string;
  entity_type: 'gmnotes' | 'campaignnotes';
  deleted_at: string;
}

export interface UseNotesTrashParams {
  campaignId: string;
  accessToken: string | null | undefined;
  /** false = niente fetch ne' sottoscrizione realtime - chiamato SEMPRE
   *  (regole di React sulle hook), disabilitato per chi non e' GM: il
   *  Cestino e' owner-only, stesso principio di `enabled` gia' usato per
   *  la sezione Note del GM (vedi useEntityTabs.ts/useCampaignNotesSection.tsx). */
  enabled: boolean;
}

export function useNotesTrash({ campaignId, accessToken, enabled }: UseNotesTrashParams) {
  const [notes, setNotes] = useState<TrashedNote[]>([]);
  const [folders, setFolders] = useState<TrashedFolder[]>([]);

  const fetchTrash = async () => {
    if (!enabled || !campaignId) {
      setNotes([]);
      setFolders([]);
      return;
    }
    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/${campaignId}/trash`, {
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      const data = await res.json();
      if (!res.ok) return;
      setNotes(data.notes ?? []);
      setFolders(data.folders ?? []);
    } catch (err) {
      console.error('Errore caricamento cestino:', err);
    }
  };

  useEffect(() => {
    fetchTrash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, campaignId, accessToken]);

  // Realtime: un cestinamento/ripristino altrui e' un UPDATE (deleted_at
  // valorizzato/azzerato), un purge e' un DELETE - stesso canale
  // campaign:{campaignId} gia' condiviso da useEntityTabs.ts/useFolderSection.tsx,
  // filtrato qui per tabella+entity_type nello scope del Cestino.
  const handleBroadcast = (msg: any) => {
    const data = msg?.payload ?? {};
    if (data.table === 'entity_notes') {
      if (data.operation === 'DELETE') {
        const deletedId = data.old_record?.id;
        if (deletedId) setNotes(prev => prev.filter(n => n.id !== deletedId));
        return;
      }
      const row = data.record;
      if (!row || !NOTE_TRASH_TYPES.includes(row.entity_type)) return;
      if (row.deleted_at) {
        setNotes(prev => {
          const exists = prev.some(n => n.id === row.id);
          return exists ? prev.map(n => (n.id === row.id ? row : n)) : [row, ...prev];
        });
      } else {
        setNotes(prev => prev.filter(n => n.id !== row.id));
      }
      return;
    }
    if (data.table === 'folders') {
      if (data.operation === 'DELETE') {
        const deletedId = data.old_record?.id;
        if (deletedId) setFolders(prev => prev.filter(f => f.id !== deletedId));
        return;
      }
      const row = data.record;
      if (!row || !FOLDER_TRASH_TYPES.includes(row.entity_type)) return;
      if (row.deleted_at) {
        setFolders(prev => {
          const exists = prev.some(f => f.id === row.id);
          return exists ? prev.map(f => (f.id === row.id ? row : f)) : [row, ...prev];
        });
      } else {
        setFolders(prev => prev.filter(f => f.id !== row.id));
      }
    }
  };

  useCampaignChannel(enabled ? campaignId : null, {
    onBroadcast: { INSERT: handleBroadcast, UPDATE: handleBroadcast, DELETE: handleBroadcast },
  });

  const restoreNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Restore fallito');
    } catch (err) {
      console.error('Errore ripristino nota:', err);
      fetchTrash();
    }
  };

  const purgeNote = async (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    try {
      const res = await fetch(`${SERVER_BASE}/notes/${id}/purge`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Purge fallito');
    } catch (err) {
      console.error('Errore eliminazione definitiva nota:', err);
      fetchTrash();
    }
  };

  const restoreFolder = async (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    try {
      const res = await fetch(`${SERVER_BASE}/folders/${id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Restore fallito');
    } catch (err) {
      console.error('Errore ripristino cartella:', err);
      fetchTrash();
    }
  };

  const purgeFolder = async (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    try {
      const res = await fetch(`${SERVER_BASE}/folders/${id}/purge`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Purge fallito');
    } catch (err) {
      console.error('Errore eliminazione definitiva cartella:', err);
      fetchTrash();
    }
  };

  const restoreAll = async () => {
    setNotes([]);
    setFolders([]);
    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/${campaignId}/trash/restore-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Restore-all fallito');
    } catch (err) {
      console.error('Errore ripristino cestino:', err);
      fetchTrash();
    }
  };

  const emptyTrash = async () => {
    setNotes([]);
    setFolders([]);
    try {
      const res = await fetch(`${SERVER_BASE}/campaigns/${campaignId}/trash/empty`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken ?? ''}` },
      });
      if (!res.ok) throw new Error('Svuotamento fallito');
    } catch (err) {
      console.error('Errore svuotamento cestino:', err);
      fetchTrash();
    }
  };

  return {
    notes,
    folders,
    count: notes.length + folders.length,
    restoreNote,
    purgeNote,
    restoreFolder,
    purgeFolder,
    restoreAll,
    emptyTrash,
  };
}
