export type EntityNotesEntityType = 'character' | 'npc' | 'monster' | 'campaign' | 'note';

interface EntityNoteRow {
  id: string;
  tab_name: string;
  content: string | null;
  hidden: boolean | null;
}

/**
 * Duplica tutte le tab personalizzate (entity_notes) di un'entita' su
 * un'altra - usato da "Duplica" (MyCharactersPage.tsx) subito dopo aver
 * creato la nuova riga PG/PNG/Mostro con duplicateCharacter/duplicateNPC/
 * duplicateMonster. entity_notes non e' mai raggiungibile da query dirette
 * del client Supabase (solo dagli endpoint REST sotto, protetti da
 * canAccessEntityNotes lato server - vedi supabase/functions/server/index.tsx),
 * quindi qui si orchestrano le stesse chiamate gia' usate da useEntityTabs.ts.
 *
 * Sequenziale, non Promise.all: la posizione di ogni nuova tab la calcola il
 * server contando le righe esistenti al momento della POST - richieste in
 * parallelo leggerebbero lo stesso conteggio e finirebbero con posizioni
 * duplicate. L'ordine di iterazione (note gia' ordinate per position dalla
 * GET) basta a preservare l'ordine originale.
 */
export async function duplicateEntityNotes(
  entityType: EntityNotesEntityType,
  sourceEntityId: string,
  newEntityId: string,
  campaignId: string | null,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const getRes = await fetch(
    `${serverBase}/campaigns/${campaignId}/notes?entityType=${entityType}&entityId=${sourceEntityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const getData = await getRes.json();
  if (!getRes.ok) throw new Error(getData.error ?? 'Errore lettura tab da duplicare');
  const notes: EntityNoteRow[] = getData.notes ?? [];

  for (const note of notes) {
    const createRes = await fetch(`${serverBase}/campaigns/${campaignId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ entityType, entityId: newEntityId, tabName: note.tab_name }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.error ?? 'Errore creazione tab duplicata');

    await fetch(`${serverBase}/notes/${createData.note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ content: note.content ?? '', hidden: note.hidden ?? false }),
    });

    // Ogni nota puo' essere a sua volta un contenitore con proprie sotto-tab
    // (entity_type='note', entity_id=questa nota - vedi
    // supabase-add-note-subtabs.sql): si richiama la stessa funzione un
    // livello piu' in profondita', dalla nota originale (sourceEntityId=
    // note.id) verso la sua copia appena creata (newEntityId=
    // createData.note.id). Si ferma da sola dopo un solo livello: le
    // sotto-tab non hanno mai proprie sotto-tab (nessuna riga con
    // entity_type='note' punta a un'altra riga entity_type='note').
    await duplicateEntityNotes('note', note.id, createData.note.id, campaignId, serverBase, accessToken);
  }
}
