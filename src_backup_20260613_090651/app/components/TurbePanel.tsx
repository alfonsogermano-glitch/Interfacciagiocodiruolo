import { Plus, X, Skull } from 'lucide-react';
import { useState } from 'react';
import type { Turba, TurbaLevel } from '../../types/character';

interface TurbePanelProps {
  turbe: Turba[];
  onUpdate: (turbe: Turba[]) => void;
}

const TURBA_INFO: Record<TurbaLevel, { className: string; effect: string }> = {
  Lieve: {
    className: 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)]',
    effect: "-1 a tutti i tiri mentre esposto all'innesco"
  },
  Moderata: {
    className: 'border-[var(--dash-accent)] bg-[var(--dash-panel)]',
    effect:
      'Tiro Critico Carisma+Freddezza per non cedere. Se fallisci, cadi preda della turba'
  },
  Grave: {
    className: 'border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]/45',
    effect:
      'Tiro Estremo Carisma+Freddezza o crolli. Con sostanze: Critico ma diventi Intossicato'
  }
};

export function TurbePanel({ turbe, onUpdate }: TurbePanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTurba, setNewTurba] = useState<Partial<Turba>>({
    level: 'Lieve',
    trigger: '',
    description: ''
  });

  const addTurba = () => {
    if (newTurba.trigger && newTurba.description && newTurba.level) {
      onUpdate([...turbe, newTurba as Turba]);
      setNewTurba({ level: 'Lieve', trigger: '', description: '' });
      setShowAdd(false);
    }
  };

  const removeTurba = (index: number) => {
    onUpdate(turbe.filter((_, i) => i !== index));
  };

  const hasGrave = turbe.some(turba => turba.level === 'Grave');

  return (
    <div className="rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull className="h-5 w-5 text-[var(--dash-accent-2)]" />
          <h3 className="font-medium text-[var(--dash-text)]">
            Turbe Mentali
          </h3>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] p-1.5 transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          <Plus className="h-4 w-4 text-[var(--dash-text)]" />
        </button>
      </div>

      {turbe.length === 0 ? (
        <div className="py-6 text-center text-sm text-[var(--dash-muted)]">
          Nessuna turba (per ora...)
        </div>
      ) : (
        <div className="space-y-2">
          {turbe.map((turba, index) => {
            const info = TURBA_INFO[turba.level];

            return (
              <div
                key={`${turba.level}-${index}`}
                className={`rounded-lg border p-3 ${info.className}`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="font-medium text-[var(--dash-text-strong)]">
                    Turba {turba.level}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeTurba(index)}
                    className="rounded p-1 text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-2 text-sm text-[var(--dash-text)]">
                  <span className="font-medium text-[var(--dash-text-strong)]">
                    Innesco:
                  </span>{' '}
                  {turba.trigger}
                </div>

                <div className="mb-2 text-xs text-[var(--dash-muted)]">
                  {turba.description}
                </div>

                <div className="text-xs italic text-[var(--dash-accent-2)]">
                  {info.effect}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 space-y-3 border-t border-[var(--dash-border-soft)] pt-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">
              Livello
            </label>

            <select
              value={newTurba.level}
              onChange={event =>
                setNewTurba({
                  ...newTurba,
                  level: event.target.value as TurbaLevel
                })
              }
              className="w-full rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text)]"
            >
              <option value="Lieve">Lieve</option>
              <option value="Moderata">Moderata</option>
              <option value="Grave">Grave</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">
              Innesco
            </label>

            <input
              type="text"
              value={newTurba.trigger}
              onChange={event =>
                setNewTurba({ ...newTurba, trigger: event.target.value })
              }
              placeholder="Es. Camion della nettezza urbana"
              className="w-full rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--dash-muted)]">
              Descrizione
            </label>

            <textarea
              value={newTurba.description}
              onChange={event =>
                setNewTurba({
                  ...newTurba,
                  description: event.target.value
                })
              }
              placeholder="Es. Fobia irrazionale per i camion della spazzatura"
              rows={2}
              className="w-full resize-none rounded border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-2 py-1.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)]"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-1.5 text-sm text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)]"
            >
              Annulla
            </button>

            <button
              type="button"
              onClick={addTurba}
              className="flex-1 rounded border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1.5 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
            >
              Aggiungi
            </button>
          </div>
        </div>
      )}

      {hasGrave && (
        <div className="mt-3 border-t border-[var(--dash-border-soft)] pt-3">
          <div className="rounded-lg border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)]/35 p-2 text-xs text-[var(--dash-danger-text)]">
            ⚠️ Hai una Turba Grave. Un'altra turba ti farà impazzire
            irrimediabilmente!
          </div>
        </div>
      )}
    </div>
  );
}
