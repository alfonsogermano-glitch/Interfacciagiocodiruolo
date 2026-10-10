/**
 * Formato condiviso del badge "ambito" mostrato su card/righe di PG/PNG/Mostri:
 * solo nome campagna se l'entita' non e' assegnata a un capitolo specifico,
 * "Nome Campagna - Nome Capitolo" se lo e'. Usato da MonstersManager.tsx,
 * NPCManager.tsx e MyCharactersPage.tsx - centralizzato qui perche' deve
 * restare identico nelle tre superfici, non perche' la logica sia complessa.
 */
export function formatCampaignChapterLabel(
  campaignName: string | null | undefined,
  chapterTitle?: string | null
): string {
  const campaign = campaignName ?? 'Campagna sconosciuta';
  return chapterTitle ? `${campaign} - ${chapterTitle}` : campaign;
}
