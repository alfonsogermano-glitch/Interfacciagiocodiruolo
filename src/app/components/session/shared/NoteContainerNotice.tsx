import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import { usePortalContainer } from '../../ui/portal-container';
import type { NoteContainerRejection } from './noteContainerPolicy';

export const NOTE_CONTAINER_REJECTION_MESSAGES: Record<NoteContainerRejection, string> = {
  'max-depth': 'Impossibile inserire: profondità massima dei contenitori raggiunta.',
  'table-in-table': 'Non è possibile inserire una tabella dentro un’altra tabella.',
  'table-clipboard-in-table': 'Non è possibile incollare celle o tabelle dentro un’altra tabella.',
  'collapse-summary': 'Il titolo del Collapse può contenere solo testo.',
};

export function NoteContainerNotice({ reason, anchor }: { reason: NoteContainerRejection | null; anchor: HTMLElement | null }) {
  const portalContainer = usePortalContainer();
  if (!reason || !anchor) return null;
  const rect = anchor.getBoundingClientRect();
  return createPortal(
    <div
      data-note-contextual-ui="true"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-[10000] flex max-w-[min(420px,calc(100vw-16px))] items-start gap-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text)] shadow-lg"
      style={{ top: Math.min(window.innerHeight - 72, Math.max(8, rect.top + 8)), left: Math.min(window.innerWidth - 428, Math.max(8, rect.left + rect.width - 420)) }}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--dash-accent)]" />
      <span>{NOTE_CONTAINER_REJECTION_MESSAGES[reason]}</span>
    </div>,
    portalContainer ?? document.body,
  );
}
