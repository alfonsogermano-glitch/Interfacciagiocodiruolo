import { useState } from 'react';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import type { DiceFormulaFolder } from './diceTypes.ts';

interface DeleteDiceFormulaFolderDialogProps {
  folder: DiceFormulaFolder;
  hasContents: boolean;
  onConfirm: (deleteContents: boolean) => void;
  onCancel: () => void;
}

export function DeleteDiceFormulaFolderDialog({
  folder,
  hasContents,
  onConfirm,
  onCancel,
}: DeleteDiceFormulaFolderDialogProps) {
  const [deleteContents, setDeleteContents] = useState(false);

  const message = hasContents
    ? `La cartella “${folder.name}” contiene formule o sottocartelle. Senza selezionare l'opzione qui sotto, il contenuto verrà spostato nella cartella superiore o nella root.`
    : `Vuoi eliminare definitivamente la cartella “${folder.name}”?`;

  return (
    <ConfirmDialog
      title="Elimina cartella"
      message={message}
      confirmLabel="Elimina"
      onConfirm={() => onConfirm(deleteContents)}
      onCancel={onCancel}
      extraContent={hasContents ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] p-3 text-sm text-[var(--dash-text)]">
          <input
            data-dice-folder-delete-contents
            type="checkbox"
            checked={deleteContents}
            onChange={(event) => setDeleteContents(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--dash-accent)]"
          />
          <span>
            <span className="block font-semibold text-red-300">Elimina anche tutto il contenuto della cartella</span>
            <span className="mt-1 block text-xs text-[var(--dash-muted)]">Formule e sottocartelle verranno eliminate definitivamente.</span>
          </span>
        </label>
      ) : undefined}
    />
  );
}
