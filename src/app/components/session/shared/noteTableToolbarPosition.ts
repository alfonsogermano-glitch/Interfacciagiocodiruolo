interface HorizontalBounds {
  left: number;
  right: number;
}

interface NoteTableToolbarHorizontalInput {
  tableBounds: HorizontalBounds;
  visibleBounds: HorizontalBounds;
  hasHorizontalOverflow: boolean;
  viewportWidth: number;
  /** Bordo destro dello shell editor: oltre c'e' la corona dei "+" del gutter. */
  shellRight?: number;
  toolbarWidth?: number;
  gap?: number;
  edgePadding?: number;
}

// Geometria dei "+" del gutter (NoteRowGutter): pulsante da 16px ancorato a
// 2px dal bordo della shell, con 4px di margine fra menu e pulsante.
const GUTTER_EDGE = 2;
const GUTTER_BUTTON_SIZE = 16;
const GUTTER_CROWN_MARGIN = 4;
/** Ampiezza della corona riservata ai "+": offset + pulsante + margine. */
export const NOTE_TABLE_TOOLBAR_GUTTER_ZONE =
  GUTTER_EDGE + GUTTER_BUTTON_SIZE + GUTTER_CROWN_MARGIN;

/**
 * Keep the toolbar beside the real table while the table fits in the editor
 * (anchor to the visible right edge when the table scrolls horizontally).
 * When the natural spot would invade the shell's right "+" crown, the
 * toolbar jumps beyond the crown - to the right of the "+" - instead of
 * sliding over the table's last column. Only when no room remains before
 * the viewport edge does it fall back to a spot clamped before the crown, so
 * the "+" buttons stay visible and clickable in every layout. The toolbar
 * never flips to the left side: that side owns its own "+" crown.
 */
export function getNoteTableToolbarLeft({
  tableBounds,
  visibleBounds,
  hasHorizontalOverflow,
  viewportWidth,
  shellRight,
  toolbarWidth = 40,
  gap = 8,
  edgePadding = 8,
}: NoteTableToolbarHorizontalInput): number {
  const anchor = hasHorizontalOverflow ? visibleBounds : tableBounds;
  const rightSide = anchor.right + gap;
  const fitsViewport = viewportWidth - edgePadding - toolbarWidth;

  if (shellRight === undefined) return Math.max(edgePadding, Math.min(rightSide, fitsViewport));

  const crownStart = shellRight - GUTTER_EDGE - GUTTER_BUTTON_SIZE;
  const gutterLimit = crownStart - GUTTER_CROWN_MARGIN - toolbarWidth;
  const beyondCrown = crownStart + GUTTER_BUTTON_SIZE + GUTTER_CROWN_MARGIN;

  let left = rightSide;
  if (left + toolbarWidth > crownStart) {
    // La posizione naturale entrerebbe nella corona: il menu salta oltre il
    // "+" invece di scivolare sull'ultima colonna della tabella.
    left = beyondCrown;
  }
  if (left > fitsViewport) {
    // Nessuno spazio oltre la corona dentro il viewport (shell a filo
    // bordo): torno a sinistra clampato prima della corona, cosi' i "+"
    // restano sempre visibili e cliccabili.
    left = gutterLimit;
  }
  return Math.max(edgePadding, Math.min(left, fitsViewport));
}
