import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';

interface NoteHistoryRowProps {
  timestampLabel: string;
  active: boolean;
  onSelect: () => void;
  onRestore: () => void;
}

/**
 * Riga di una versione nella cronologia - mirror di TrashRow.tsx (stessa
 * struttura riga+azione+ConfirmDialog), ma con selezione (per l'anteprima
 * nel pannello destro, vedi NoteHistoryPanel.tsx) invece di sola eliminazione.
 * Nessun testo/anteprima qui sulla riga: solo la data, come TrashRow.
 */
export function NoteHistoryRow({ timestampLabel, active, onSelect, onRestore }: NoteHistoryRowProps) {
  const [confirmRestore, setConfirmRestore] = useState(false);

  return (
    <div
      onClick={onSelect}
      className={`flex cursor-default items-center gap-1 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--dash-surface-2)]/50 active:bg-[var(--dash-surface-2)] ${active ? 'bg-[var(--dash-surface-2)]' : ''}`}
    >
      <div className="min-w-0 flex-1 whitespace-normal break-words text-sm text-[var(--dash-text)]">{timestampLabel}</div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setConfirmRestore(true)}
            aria-label="Ripristina questa versione"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Ripristina questa versione</TooltipContent>
      </Tooltip>

      {confirmRestore && (
        <ConfirmDialog
          title="Ripristinare questa versione?"
          message="Il contenuto attuale della nota verrà sostituito da questa versione precedente. La versione attuale viene comunque salvata in cronologia prima della sostituzione, quindi resta recuperabile."
          confirmLabel="Ripristina"
          danger={false}
          onConfirm={() => { setConfirmRestore(false); onRestore(); }}
          onCancel={() => setConfirmRestore(false)}
        />
      )}
    </div>
  );
}
