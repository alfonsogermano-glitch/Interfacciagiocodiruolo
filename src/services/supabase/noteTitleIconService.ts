import type { JSONContent } from '@tiptap/core';
import { projectId } from '/utils/supabase/info';
import { supabase } from '../../lib/supabaseClient';
import { duplicateEntityNotes } from './entityNotesService';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

/**
 * Aggiorna l'icona opzionale mostrata prima del titolo di una nota di
 * campagna. La regola di autorizzazione reale vive nella RPC SQL
 * set_entity_note_title_icon: GM sempre, giocatore solo sulla propria nota
 * mentre e' ancora membro della campagna.
 */
export async function setNoteTitleIcon(noteId: string, titleIcon: string | null): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase non configurato');
  }

  const { error } = await supabase.rpc('set_entity_note_title_icon', {
    p_note_id: noteId,
    p_title_icon: titleIcon,
  });

  if (error) {
    throw new Error(error.message || 'Errore aggiornamento icona titolo nota');
  }
}

export interface CampaignNoteDuplicateSource {
  id: string;
  tab_name: string;
  content: string | null;
  content_rich: JSONContent | null;
  hidden: boolean;
  folder_id: string | null;
  title_icon: string | null;
}

/**
 * Versione title-aware del "Duplica" della colonna Note. Mantiene lo stesso
 * flusso gia' usato prima da useEntityTabs.handleDuplicateCustomTab:
 * POST della nuova nota, PUT del contenuto rich/legacy, copia ricorsiva delle
 * eventuali sotto-tab. L'unica estensione e' la copia di title_icon tramite
 * la RPC dedicata, senza contaminare tab_name o il documento TipTap.
 *
 * Non duplica `visibility`, esattamente come il comportamento precedente del
 * menu: una copia nasce col default del server e mantiene invece hidden e
 * cartella della sorgente.
 */
export async function duplicateCampaignNoteWithTitleIcon(
  source: CampaignNoteDuplicateSource,
  campaignId: string,
  accessToken: string,
): Promise<string> {
  const createRes = await fetch(`${SERVER_BASE}/campaigns/${campaignId}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      entityType: 'campaign',
      entityId: campaignId,
      tabName: `${source.tab_name} (copia)`,
      hidden: source.hidden,
      folderId: source.folder_id,
    }),
  });
  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createData.error ?? 'Errore creazione nota duplicata');
  }

  const putRes = await fetch(`${SERVER_BASE}/notes/${createData.note.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      content: source.content ?? '',
      contentRich: source.content_rich,
    }),
  });
  const putData = await putRes.json().catch(() => ({}));
  if (!putRes.ok) {
    throw new Error(putData.error ?? 'Errore copia contenuto nota');
  }

  if (source.title_icon) {
    await setNoteTitleIcon(createData.note.id, source.title_icon);
  }

  await duplicateEntityNotes(
    'note',
    source.id,
    createData.note.id,
    campaignId,
    SERVER_BASE,
    accessToken,
  );

  return createData.note.id;
}
