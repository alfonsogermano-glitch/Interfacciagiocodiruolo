import type { SessionMapToken } from '../../../types/sessionMapToken';
import type { SessionMapDrawing } from '../../../types/sessionMapDrawing';
import type { SessionMapPoi } from '../../../types/sessionMapPoi';

/**
 * The ORIGINAL SessionWorkspace player-publication rules, extracted intact.
 * These are client projections only: they DO NOT grant network authorization.
 * Aruba GM host must project before sending any map packet, and the eventual
 * network protocol must verify that the sender is the current campaign GM.
 */
export function publicMapTokens(tokens: SessionMapToken[]): SessionMapToken[] {
  // La visibilità della scheda sorgente controlla il catalogo laterale, non
  // il token già posizionato. Sulla mappa l'unica autorità è il comando
  // Mostra/Nascondi del token (`visible`).
  return tokens.filter((token) => token.visible !== false);
}

export function publicMapDrawings(drawings: SessionMapDrawing[]): SessionMapDrawing[] {
  return drawings.filter((drawing) => drawing.visible !== false);
}

export function publicMapPois(pois: SessionMapPoi[]): SessionMapPoi[] {
  return pois
    .filter((poi) => poi.visibleToPlayers)
    .map((poi) => ({
      ...poi,
      noteId: poi.noteVisibleToPlayers ? poi.noteId : null,
    }));
}
