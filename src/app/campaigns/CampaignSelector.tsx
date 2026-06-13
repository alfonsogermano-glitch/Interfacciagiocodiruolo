import { useState } from 'react';
import {
  Plus,
  BookOpen,
  Trash2,
  Edit2,
  CheckCircle2,
  Loader2,
  X,
  ChevronDown,
  Swords,
  Skull,
  Castle,
  Sparkles
} from 'lucide-react';
import { useCampaign } from './CampaignContext';
import { RULESETS, type Campaign, type CampaignCreateInput, type RulesetId } from './campaignTypes';

const RULESET_ICONS: Record<RulesetId, React.ReactNode> = {
  hsc: <Skull className="h-4 w-4" />,
  dnd5e: <Swords className="h-4 w-4" />,
  pathfinder: <Castle className="h-4 w-4" />,
  custom: <Sparkles className="h-4 w-4" />,
};

// ─── Create/Edit Form ───────────────────────────────────────────────────────

function CampaignForm({
  initial,
  onSave,
  onCancel,
  isSubmitting,
}: {
  initial?: Partial<CampaignCreateInput>;
  onSave: (data: CampaignCreateInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [ruleset, setRuleset] = useState<RulesetId>(initial?.ruleset ?? 'hsc');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), ruleset });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-[var(--dash-text)]">Nome campagna *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="es. La Scuola degli Orrori"
          required
          autoFocus
          className="w-full rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-[var(--dash-text)]">Descrizione</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Breve descrizione della campagna..."
          rows={2}
          className="w-full resize-none rounded-xl border-2 border-[var(--dash-border)] bg-[var(--dash-input)] px-4 py-2.5 text-sm text-[var(--dash-text)] placeholder-[var(--dash-muted)] outline-none focus:border-[var(--dash-accent)]"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm text-[var(--dash-text)]">Regolamento</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.values(RULESETS)).map(rs => (
            <button
              key={rs.id}
              type="button"
              onClick={() => setRuleset(rs.id)}
              className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                ruleset === rs.id
                  ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)] ring-1 ring-[var(--dash-accent)]/40'
                  : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]/50'
              }`}
            >
              <span className="mt-0.5 shrink-0 text-[var(--dash-accent)]">
                {RULESET_ICONS[rs.id]}
              </span>
              <span>
                <span className="block text-sm font-medium text-[var(--dash-text-strong)]">
                  {rs.name}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--dash-muted)] line-clamp-2">
                  {rs.description}
                </span>
              </span>
              {ruleset === rs.id && (
                <CheckCircle2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-[var(--dash-accent)]" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)] hover:bg-[var(--dash-surface-2)]"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial?.name ? 'Salva modifiche' : 'Crea campagna'}
        </button>
      </div>
    </form>
  );
}

// ─── Campaign Card ───────────────────────────────────────────────────────────

function CampaignCard({
  campaign,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  campaign: Campaign;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rs = RULESETS[campaign.ruleset] ?? RULESETS.custom;

  return (
    <div
      className={`group relative rounded-2xl border p-5 transition-all ${
        isActive
          ? 'border-[var(--dash-accent)] bg-[var(--dash-panel)] shadow-[0_0_24px_var(--dash-accent)]/20'
          : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] hover:border-[var(--dash-accent)]/50 hover:bg-[var(--dash-panel)]'
      }`}
    >
      {/* Active badge */}
      {isActive && (
        <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-[var(--dash-accent)] bg-[var(--dash-accent)]/20 px-2 py-0.5 text-xs text-[var(--dash-accent)]">
          <CheckCircle2 className="h-3 w-3" /> Attiva
        </span>
      )}

      {/* Ruleset badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-2.5 py-1 text-xs text-[var(--dash-text)]">
          {RULESET_ICONS[campaign.ruleset]}
          {rs.name}
        </span>
      </div>

      <h3 className="mb-1 pr-16 text-base font-semibold text-[var(--dash-text-strong)]">
        {campaign.name}
      </h3>

      {campaign.description && (
        <p className="mb-4 line-clamp-2 text-sm text-[var(--dash-muted)]">
          {campaign.description}
        </p>
      )}

      <div className="flex items-center gap-2">
        {!isActive && (
          <button
            type="button"
            onClick={onSelect}
            className="flex-1 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-3 py-1.5 text-sm font-medium text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]"
          >
            Seleziona
          </button>
        )}

        <button
          type="button"
          onClick={onEdit}
          title="Modifica"
          className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1.5 text-[var(--dash-muted)] hover:text-[var(--dash-text)]"
        >
          <Edit2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onDelete}
          title="Elimina"
          className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1.5 text-[var(--dash-muted)] hover:border-[var(--dash-danger-border)] hover:text-[var(--dash-danger-text)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export function CampaignSelector({ onClose }: { onClose: () => void }) {
  const { campaigns, activeCampaignId, isLoading, setActiveCampaign, createCampaign, updateCampaign, deleteCampaign } = useCampaign();

  const [view, setView] = useState<'list' | 'create' | { edit: Campaign }>('list');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleCreate = async (data: CampaignCreateInput) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await createCampaign(data);
      setView('list');
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async (id: string, data: CampaignCreateInput) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await updateCampaign(id, data);
      setView('list');
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCampaign(id);
      setConfirmDelete(null);
    } catch (err) {
      setErrorMessage(String(err));
    }
  };

  const handleSelect = (campaign: Campaign) => {
    setActiveCampaign(campaign);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-[var(--dash-accent)] bg-[var(--dash-surface)] shadow-2xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--dash-border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-[var(--dash-accent)]" />
            <h2 className="text-lg font-semibold text-[var(--dash-text-strong)]">
              {view === 'create' ? 'Nuova campagna' : typeof view === 'object' ? 'Modifica campagna' : 'Le tue campagne'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6">
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-3 text-sm text-[var(--dash-danger-text)]">
              {errorMessage}
            </div>
          )}

          {/* Create form */}
          {view === 'create' && (
            <CampaignForm
              onSave={handleCreate}
              onCancel={() => setView('list')}
              isSubmitting={isSubmitting}
            />
          )}

          {/* Edit form */}
          {typeof view === 'object' && 'edit' in view && (
            <CampaignForm
              initial={view.edit}
              onSave={data => handleEdit(view.edit.id, data)}
              onCancel={() => setView('list')}
              isSubmitting={isSubmitting}
            />
          )}

          {/* List */}
          {view === 'list' && (
            <>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--dash-accent)]" />
                </div>
              ) : campaigns.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <BookOpen className="h-12 w-12 text-[var(--dash-muted)]" />
                  <div>
                    <p className="font-medium text-[var(--dash-text-strong)]">Nessuna campagna</p>
                    <p className="mt-1 text-sm text-[var(--dash-muted)]">Crea la tua prima campagna per iniziare.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView('create')}
                    className="flex items-center gap-2 rounded-xl border border-[var(--dash-accent)] bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)]"
                  >
                    <Plus className="h-4 w-4" /> Crea campagna
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {campaigns.map(campaign => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      isActive={campaign.id === activeCampaignId}
                      onSelect={() => handleSelect(campaign)}
                      onEdit={() => setView({ edit: campaign })}
                      onDelete={() => setConfirmDelete(campaign.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer (list view only) */}
        {view === 'list' && campaigns.length > 0 && (
          <div className="border-t border-[var(--dash-border)] px-6 py-4">
            <button
              type="button"
              onClick={() => setView('create')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] py-2.5 text-sm text-[var(--dash-text)] hover:border-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]"
            >
              <Plus className="h-4 w-4" /> Nuova campagna
            </button>
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--dash-danger-border)] bg-[var(--dash-surface)] p-6 shadow-2xl">
            <h3 className="mb-2 font-semibold text-[var(--dash-text-strong)]">Elimina campagna</h3>
            <p className="mb-5 text-sm text-[var(--dash-muted)]">
              Questa azione è irreversibile. Tutti i dati della campagna nel server saranno eliminati.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-4 py-2 text-sm text-[var(--dash-text-strong)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-xl border border-[var(--dash-danger-border)] bg-[var(--dash-danger-bg)] px-4 py-2 text-sm font-semibold text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-border)]"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact switcher (per header) ──────────────────────────────────────────

export function CampaignSwitcher({ onClick }: { onClick: () => void }) {
  const { activeCampaign, isLoading } = useCampaign();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] px-3 py-2 text-sm text-[var(--dash-text-strong)] transition-colors hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface-2)]"
    >
      <BookOpen className="h-4 w-4 text-[var(--dash-accent)]" />
      <span className="hidden max-w-[160px] truncate sm:block">
        {isLoading ? 'Caricamento...' : (activeCampaign?.name ?? 'Nessuna campagna')}
      </span>
      <ChevronDown className="h-3 w-3 text-[var(--dash-muted)]" />
    </button>
  );
}
