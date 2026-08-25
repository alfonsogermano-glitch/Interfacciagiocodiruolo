interface HorizontalBounds {
  left: number;
  right: number;
}

interface NoteTableToolbarHorizontalInput {
  tableBounds: HorizontalBounds;
  visibleBounds: HorizontalBounds;
  hasHorizontalOverflow: boolean;
  viewportWidth: number;
  toolbarWidth?: number;
  gap?: number;
  edgePadding?: number;
}

/**
 * Keep the toolbar beside the real table while the table fits in the editor.
 * Once the table itself is wider than the horizontal viewport, anchor the
 * toolbar to the visible right edge instead so it does not disappear offscreen.
 */
export function getNoteTableToolbarLeft({
  tableBounds,
  visibleBounds,
  hasHorizontalOverflow,
  viewportWidth,
  toolbarWidth = 40,
  gap = 8,
  edgePadding = 8,
}: NoteTableToolbarHorizontalInput): number {
  const anchor = hasHorizontalOverflow ? visibleBounds : tableBounds;
  const rightSide = anchor.right + gap;
  return rightSide + toolbarWidth <= viewportWidth - edgePadding
    ? rightSide
    : Math.max(edgePadding, anchor.left - toolbarWidth - gap);
}
