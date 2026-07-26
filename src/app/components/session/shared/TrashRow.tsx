import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';

interface TrashRowProps {
  name: string;
  /** "Nota" | "Sotto-tab" | "Cartella" */
  typeLabel: string;
  /** "Campagna" | "GM" */
  scopeLabel: string;
  onRestore: () => void;
  onPurge: () => void;
  /** Nessuna vista di dettaglio per il Cestino (solo Ripristina/Elimina
   *  definitivamente, qui sulla riga) - questo callback serve solo a far
   *  sapere al chiamante "l'utente sta interagendo col Cestino", cosi' il
   *  pannello destro puo' confermare/mantenere il placeholder dedicato
   *  invece di un'assenza di riscontro al click - vedi SessionNotesPanel.tsx. */
  onSelect: () => void;
}

/**
 * Riga semplice per un elemento nel Cestino - a differenza di NoteListRow.tsx
 * (nota attiva) qui non serve rinominare/duplicare/spostare: solo
 * "Ripristina" e "Elimina definitivamente" (con conferma, azione senza
 * ritorno). Nessun drill-down: il Cestino e' una lista piatta.
 */
export function TrashRow({ name, typeLabel, scopeLabel, onRestore, onPurge, onSelect }: TrashRowProps) {
  const [confirmPurge, setConfirmPurge] = useState(false);

  return (
    <div
      onClick={onSelect}
      className="flex cursor-default items-center gap-1 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--dash-surface-2)]/50 active:bg-[var(--dash-surface-2)]"
    >
      <div className="min-w-0 flex-1">
        <div className="whitespace-normal break-words text-sm text-[var(--dash-text)]">{name}</div>
        <div className="text-xs text-[var(--dash-muted)]">{typeLabel} · {scopeLabel}</div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRestore}
            aria-label="Ripristina"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Ripristina</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setConfirmPurge(true)}
            aria-label="Elimina definitivamente"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-danger-text)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Elimina definitivamente</TooltipContent>
      </Tooltip>

      {confirmPurge && (
        <ConfirmDialog
          title="Eliminare definitivamente?"
          message={`"${name}" verrà eliminato per sempre. Questa azione non è reversibile.`}
          confirmLabel="Elimina per sempre"
          onConfirm={() => { setConfirmPurge(false); onPurge(); }}
          onCancel={() => setConfirmPurge(false)}
        />
      )}
    </div>
  );
}
