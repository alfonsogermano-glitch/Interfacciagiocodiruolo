import { CheckCircle2, X } from 'lucide-react';
import { VISIBLE_RULESETS, type RulesetId } from './campaignTypes';
import { RULESET_ICONS } from '../components/shared/RulesetTag';

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
      <div className="w-full max-w-lg rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] p-6 shadow-2xl">
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

        <div className="grid gap-2 sm:grid-cols-2">
          {VISIBLE_RULESETS.map(rs => (
            <button
              key={rs.id}
              type="button"
              onClick={() => onChoose(rs.id)}
              className="group flex items-start gap-3 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_var(--dash-card-shadow)]"
              style={{ borderColor: undefined }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = `${rs.color}88`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = ''; }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${rs.color}1a`, color: rs.color }}
              >
                {RULESET_ICONS[rs.id]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
                  {rs.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--dash-muted)] line-clamp-2">
                  {rs.description}
                </span>
              </span>
              <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-[var(--dash-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
