import { Plus, X, Activity } from 'lucide-react';
import { useState } from 'react';
import type { Condition, ConditionType } from '../../types/character';

interface ConditionsPanelProps {
  conditions: Condition[];
  onUpdate: (conditions: Condition[]) => void;
}

const CONDITION_INFO: Record<
  ConditionType,
  { penalty: string; description: string }
> = {
  Malconcio: {
    penalty: '-1 a tutti i tiri di Fisico',
    description: 'Graffi, lividi, ossa rotte. Serve riposo o Pronto Soccorso.'
  },
  Fuso: {
    penalty: '-1 a tutti i tiri di Scuola',
    description: 'Testa tra le nuvole, difficoltà a concentrarsi. Serve relax.'
  },
  Sfigato: {
    penalty: '-1 a tutti i tiri di Carisma',
    description: 'Figuraccia totale. Serve fare qualcosa di figo.'
  },
  Fifone: {
    penalty: '-1 a tutti i tiri di Strada',
    description: 'Paura fottuta. Serve affrontare la paura o distrarsi.'
  },
  Spezzato: {
    penalty: '-1 a TUTTI i tiri',
    description: '3+ condizioni. Serve riposo, possibilmente in clinica.'
  },
  Stanco: {
    penalty: 'Nessun malus',
    description: 'Serve dormire e mangiare bene.'
  },
  Intossicato: {
    penalty: 'Varia',
    description: 'Avvelenato, ubriaco o drogato. Varia in base al caso.'
  },
  Malato: {
    penalty: '3 caselle Freschezza bloccate',
    description: 'Influenza, virus. Serve riposo e cure mediche.'
  }
};

const CONDITION_TYPES: ConditionType[] = [
  'Malconcio',
  'Fuso',
  'Sfigato',
  'Fifone',
  'Spezzato',
  'Stanco',
  'Intossicato',
  'Malato'
];

export function ConditionsPanel({ conditions, onUpdate }: ConditionsPanelProps) {
  const [showAdd, setShowAdd] = useState(false);

  const addCondition = (type: ConditionType) => {
    if (conditions.length >= 3 && type !== 'Spezzato') {
      onUpdate([...conditions, { type: 'Spezzato' }]);
    } else {
      onUpdate([...conditions, { type }]);
    }

    setShowAdd(false);
  };

  const removeCondition = (index: number) => {
    onUpdate(conditions.filter((_, i) => i !== index));
  };

  const hasSpezzato = conditions.some(condition => condition.type === 'Spezzato');

  return (
    <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--dash-accent-2)]" />
          <h3 className="font-medium text-[var(--dash-text)]">Condizioni</h3>
          <span className="text-xs text-[var(--dash-muted)]">
            ({conditions.length}/3)
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          disabled={hasSpezzato}
          className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-1.5 transition-colors hover:bg-[var(--dash-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4 text-[var(--dash-text)]" />
        </button>
      </div>

      {conditions.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--dash-muted)]">
          Nessuna condizione
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => {
            const info = CONDITION_INFO[condition.type];

            return (
              <div
                key={`${condition.type}-${index}`}
                className={`rounded-lg border p-3 ${
                  condition.type === 'Spezzato'
                    ? 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]/45'
                    : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-1 font-medium text-[var(--dash-text-strong)]">
                      {condition.type}
                    </div>

                    <div className="mb-1 text-xs text-[var(--dash-accent-2)]">
                      {info.penalty}
                    </div>

                    <div className="text-xs text-[var(--dash-muted)]">
                      {info.description}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="rounded p-1 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
          <div className="mb-2 text-xs text-[var(--dash-muted)]">
            Aggiungi condizione:
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CONDITION_TYPES.filter(type => type !== 'Spezzato').map(type => (
              <button
                key={type}
                type="button"
                onClick={() => addCondition(type)}
                className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {conditions.length >= 3 && !hasSpezzato && (
        <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
          <div className="rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]/35 p-2 text-xs text-[var(--dash-danger-text)]">
            ⚠️ Attenzione: hai 3 condizioni. La prossima ti renderà Spezzato!
          </div>
        </div>
      )}
    </div>
  );
}
