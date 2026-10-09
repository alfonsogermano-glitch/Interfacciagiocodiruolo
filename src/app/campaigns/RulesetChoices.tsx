import { CheckCircle2 } from 'lucide-react';
import { VISIBLE_RULESETS, type RulesetId } from './campaignTypes';
import { RULESET_ICONS } from '../components/shared/RulesetTag';

/** Stesse opzioni e stesso stile per creazione personaggio e campagna. */
export function RulesetChoices({ selected, disabled = false, onChoose }: { selected?: RulesetId; disabled?: boolean; onChoose: (id: RulesetId) => void }) {
  return <div className="grid gap-2 sm:grid-cols-2">
    {VISIBLE_RULESETS.map((rs) => {
      const active = selected === rs.id;
      const unavailable = rs.id === 'coc7e' || rs.id === 'cocclassic';
      const choiceDisabled = disabled || unavailable;
      return <button
        key={rs.id}
        type="button"
        data-ruleset-choice={rs.id}
        aria-pressed={selected === undefined ? undefined : active}
        disabled={choiceDisabled}
        onClick={() => onChoose(rs.id)}
        className={`group flex items-start gap-2 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_var(--dash-card-shadow)] disabled:transform-none disabled:opacity-50 ${active ? 'ring-1 ring-[var(--dash-accent)]/40' : ''}`}
        style={{ borderColor: active ? rs.color : undefined }}
        onMouseEnter={(event) => { if (!choiceDisabled) event.currentTarget.style.borderColor = `${rs.color}88`; }}
        onMouseLeave={(event) => { event.currentTarget.style.borderColor = active ? rs.color : ''; }}
      >
        <span className="ruleset-choice-icon mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${rs.color}1a`, color: rs.color }}>{RULESET_ICONS[rs.id]}</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium leading-tight text-[var(--dash-text-strong)]">{rs.name}</span>
          <span className="mt-1 block text-xs leading-tight text-[var(--dash-muted)]">{unavailable ? 'Prossimamente' : rs.description}</span>
        </span>
        <CheckCircle2 className={`ml-auto mt-0.5 h-4 w-4 shrink-0 transition-opacity ${active ? 'text-[var(--dash-accent)]' : 'text-[var(--dash-muted)] opacity-0 group-hover:opacity-100'}`} />
      </button>;
    })}
  </div>;
}
