import { SupabaseDebug } from './SupabaseDebug';
import type { DashboardSettings } from '../../services/settings/dashboardSettings';

interface SettingsModalProps {
  draft: DashboardSettings;
  onChangeDraft: (updater: (previous: DashboardSettings) => DashboardSettings) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function SettingsModal({ draft, onChangeDraft, onSave, onCancel }: SettingsModalProps) {
  return (
    <div
      data-dashboard-palette={draft.palette}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-6 text-[var(--dash-text)] shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5">
          <div className="text-xs uppercase tracking-[0.14em] text-[var(--dash-accent-2)]">
            Impostazioni dashboard
          </div>

          <h3 className="mt-2 text-xl font-semibold text-[var(--dash-text-strong)]">
            Personalizzazione & Database
          </h3>
        </div>

        <div className="space-y-6">
          {/* Sezione Personalizzazione */}
          <div className="border-b border-[var(--dash-border)] pb-5">
            <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Personalizzazione</h4>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[var(--dash-text)]">
                  Lingua
                </label>

                <select
                  value={draft.language}
                  onChange={e =>
                    onChangeDraft(previous => ({
                      ...previous,
                      language: e.target.value as DashboardSettings['language']
                    }))
                  }
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                >
                  <option value="it">Italiano</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[var(--dash-text)]">
                  Palette
                </label>

                <select
                  value={draft.palette}
                  onChange={e =>
                    onChangeDraft(previous => ({
                      ...previous,
                      palette: e.target.value as DashboardSettings['palette']
                    }))
                  }
                  className="w-full rounded border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-3 py-2 text-[var(--dash-text)]"
                >
                  <option value="questportal">Quest Portal</option>
                  <option value="cthulhu">Cthulhu classica</option>
                  <option value="blood">Rosso sangue</option>
                  <option value="amber">Ambra antica</option>
                  <option value="emerald">Verde occulto</option>
                  <option value="arcane">Blu arcano</option>
                  <option value="noir">Noir</option>
                  <option value="frost">Gelo</option>
                  <option value="violet">Violetto cosmico</option>
                </select>
              </div>
            </div>
          </div>
          {/* Sezione Salvataggio */}
          <div className="border-b border-[var(--dash-border)] pb-5">
            <h4 className="mb-3 text-sm font-medium text-[var(--dash-text-strong)]">
              Modalità salvataggio
            </h4>

            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <input
                  type="radio"
                  name="saveMode"
                  value="cloud"
                  checked={draft.saveMode === 'cloud'}
                  onChange={() => onChangeDraft(previous => ({ ...previous, saveMode: 'cloud' }))}
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
                    Cloud Supabase
                  </span>
                  <span className="mt-1 block text-xs text-[var(--dash-muted)]">
                    Usa Supabase come archivio principale, mantenendo il fallback locale già esistente.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-4">
                <input
                  type="radio"
                  name="saveMode"
                  value="local"
                  checked={draft.saveMode === 'local'}
                  onChange={() => onChangeDraft(previous => ({ ...previous, saveMode: 'local' }))}
                  className="mt-1"
                />

                <span>
                  <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
                    Locale sul dispositivo
                  </span>
                  <span className="mt-1 block text-xs text-[var(--dash-muted)]">
                    Salva i dati sul dispositivo dell’utente. In questa fase prepara la dashboard al futuro salvataggio locale stabile.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Sezione Supabase Debug */}
          <div>
            <h4 className="text-sm font-medium text-[var(--dash-text-strong)] mb-3">Database Supabase</h4>
            <SupabaseDebug />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-[var(--dash-border)] pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-surface-2)]"
          >
            Esci senza salvare
          </button>

          <button
            type="button"
            onClick={onSave}
            className="rounded-md border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:bg-[var(--dash-accent-2)]"
          >
            Salva impostazioni
          </button>
        </div>
      </div>
    </div>
  );
}
