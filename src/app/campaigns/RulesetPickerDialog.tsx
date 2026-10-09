import { X } from 'lucide-react';
import type { RulesetId } from './campaignTypes';
import { RulesetChoices } from './RulesetChoices';

/**
 * Modale "scegli il regolamento" per la creazione di un'entità (PG/PNG) fuori
 * da una campagna. Estratta da HomeScreen.tsx per essere riusata anche da
 * MyCharactersPage.tsx invece di duplicare il markup.
 */
export function RulesetPickerDialog({
  title = 'Nuovo personaggio',
  onChoose,
  onClose,
}: {
  title?: string;
  onChoose: (rulesetId: RulesetId) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--dash-muted)]">{title}</p>
            <h3 className="text-lg font-semibold tracking-wide text-[var(--dash-text-strong)]">Scegli il regolamento</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <RulesetChoices onChoose={onChoose} />
      </div>
    </div>
  );
}
