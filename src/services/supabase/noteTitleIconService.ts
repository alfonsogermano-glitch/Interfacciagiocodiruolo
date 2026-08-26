import { supabase } from '../../lib/supabaseClient';

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
