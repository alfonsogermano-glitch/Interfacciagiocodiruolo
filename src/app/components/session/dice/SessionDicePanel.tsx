import { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, Loader2, Play, Save, Swords, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import {
  createDiceFormula,
  deleteDiceFormula,
  loadDiceFormulas,
  updateDiceFormula,
} from '../../../../services/supabase/diceFormulasService';
import { DiceFormulaBuilder } from './DiceFormulaBuilder';
import { resolveUniqueDiceFormulaName } from './diceFormulaNames.ts';
import { formatDiceFormula } from './diceFormulaText.ts';
import { validateDiceFormula } from './diceFormulaValidation.ts';
import { DiceToolbar } from './DiceToolbar';
import { SavedDiceFormulaCard } from './SavedDiceFormulaCard';
import { useDiceSession } from './DiceSessionContext';
import type { DiceFormulaItem, SavedDiceFormula } from './diceTypes.ts';

const DEFAULT_FORMULA_NAME = 'Formula senza nome';

function cloneItems(items: DiceFormulaItem[]): DiceFormulaItem[] {
  return items.map((item) => ({ ...item })) as DiceFormulaItem[];
}

export function SessionDicePanel() {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const { submitLocalRoll } = useDiceSession();

  const [name, setName] = useState(DEFAULT_FORMULA_NAME);
  const [items, setItems] = useState<DiceFormulaItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsSecret, setEditingIsSecret] = useState(false);
  const [formulas, setFormulas] = useState<SavedDiceFormula[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDiceFormula | null>(null);
  const loadSequence = useRef(0);

  const validation = useMemo(() => validateDiceFormula(items), [items]);
  const formulaText = useMemo(() => formatDiceFormula(items), [items]);

  useEffect(() => {
    const sequence = ++loadSequence.current;
    setFormulas([]);
    setEditingId(null);
    setEditingIsSecret(false);
    setName(DEFAULT_FORMULA_NAME);
    setItems([]);

    if (!activeCampaign?.id || !user?.id) return;
    setLoading(true);
    loadDiceFormulas(activeCampaign.id, user.id)
      .then((next) => {
        if (loadSequence.current === sequence) setFormulas(next);
      })
      .catch((error) => {
        if (loadSequence.current === sequence) {
          console.error(error);
          toast.error('Impossibile caricare le formule dadi.');
        }
      })
      .finally(() => {
        if (loadSequence.current === sequence) setLoading(false);
      });
  }, [activeCampaign?.id, user?.id]);

  const clearBuilder = () => {
    setName(DEFAULT_FORMULA_NAME);
    setItems([]);
    setEditingId(null);
    setEditingIsSecret(false);
  };

  const addQuickDie = (sides: number) => {
    const first = items.findIndex((item) => item.kind === 'dice' && item.sides === sides);
    if (first < 0) {
      setItems((current) => [
        ...current,
        { id: globalThis.crypto.randomUUID(), kind: 'dice', sides, quantity: 1 },
      ]);
      return;
    }

    setItems((current) => current.map((item, index) =>
      index === first && item.kind === 'dice'
        ? { ...item, quantity: item.quantity + 1 }
        : item,
    ));
  };

  const runBuilder = () => {
    if (!validation.valid) return;
    try {
      submitLocalRoll({
        items: cloneItems(items),
        formulaName: name.trim() || DEFAULT_FORMULA_NAME,
        visibility: 'public',
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore durante il tiro.');
    }
  };

  const upsertFormula = (formula: SavedDiceFormula) => {
    setFormulas((current) => [formula, ...current.filter((item) => item.id !== formula.id)]);
  };

  const saveBuilder = async () => {
    if (!user?.id || !activeCampaign?.id || !validation.valid || saving) return;
    setSaving(true);
    try {
      const uniqueName = resolveUniqueDiceFormulaName(
        name,
        formulas
          .filter((formula) => formula.id !== editingId)
          .map((formula) => formula.name),
      );

      const saved = editingId
        ? await updateDiceFormula(editingId, {
            name: uniqueName,
            items: cloneItems(items),
            isSecret: editingIsSecret,
          })
        : await createDiceFormula({
            campaignId: activeCampaign.id,
            ownerProfileId: user.id,
            name: uniqueName,
            items: cloneItems(items),
            isSecret: false,
          });

      upsertFormula(saved);
      setEditingId(saved.id);
      setEditingIsSecret(saved.isSecret);
      setName(saved.name);
      toast.success(editingId ? 'Formula aggiornata.' : 'Formula salvata.');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore nel salvataggio della formula.');
    } finally {
      setSaving(false);
    }
  };

  const editFormula = (formula: SavedDiceFormula) => {
    setEditingId(formula.id);
    setEditingIsSecret(formula.isSecret);
    setName(formula.name);
    setItems(cloneItems(formula.items));
  };

  const rollSaved = (formula: SavedDiceFormula) => {
    try {
      submitLocalRoll({
        items: cloneItems(formula.items),
        formulaId: formula.id,
        formulaName: formula.name,
        visibility: formula.isSecret ? 'secret' : 'public',
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore durante il tiro.');
    }
  };

  const toggleSecret = async (formula: SavedDiceFormula) => {
    const nextSecret = !formula.isSecret;
    setFormulas((current) => current.map((item) =>
      item.id === formula.id ? { ...item, isSecret: nextSecret } : item,
    ));
    if (editingId === formula.id) setEditingIsSecret(nextSecret);

    try {
      const updated = await updateDiceFormula(formula.id, { isSecret: nextSecret });
      upsertFormula(updated);
    } catch (error) {
      console.error(error);
      setFormulas((current) => current.map((item) =>
        item.id === formula.id ? formula : item,
      ));
      if (editingId === formula.id) setEditingIsSecret(formula.isSecret);
      toast.error('Impossibile cambiare la visibilita del tiro.');
    }
  };

  const duplicateFormula = async (formula: SavedDiceFormula) => {
    if (!user?.id || !activeCampaign?.id) return;
    try {
      const duplicateName = resolveUniqueDiceFormulaName(
        `Copia di ${formula.name}`,
        formulas.map((item) => item.name),
      );
      const duplicate = await createDiceFormula({
        campaignId: activeCampaign.id,
        ownerProfileId: user.id,
        name: duplicateName,
        items: cloneItems(formula.items),
        isSecret: formula.isSecret,
      });
      setFormulas((current) => [duplicate, ...current]);
      toast.success('Formula duplicata.');
    } catch (error) {
      console.error(error);
      toast.error('Impossibile duplicare la formula.');
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    try {
      await deleteDiceFormula(target.id);
      setFormulas((current) => current.filter((item) => item.id !== target.id));
      if (editingId === target.id) clearBuilder();
      toast.success('Formula eliminata.');
    } catch (error) {
      console.error(error);
      toast.error('Impossibile eliminare la formula.');
    }
  };

  return (
    <div data-session-dice-panel className="flex h-full min-h-0 flex-col text-[var(--dash-text)]">
      <div className="shrink-0 border-b border-[var(--dash-border)] px-6 py-5">
        <h1 className="text-xl font-semibold text-[var(--dash-text-strong)]">Formule dei dadi</h1>
        <div className="mt-4">
          <DiceToolbar items={items} onAddDie={addQuickDie} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <section className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-panel)] p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
              <Swords className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Nome formula"
                className="w-full bg-transparent text-sm font-semibold text-[var(--dash-text-strong)] outline-none"
              />
              <div className="mt-0.5 min-h-4 truncate font-mono text-xs text-[var(--dash-muted)]">
                {formulaText || 'Aggiungi un dado per iniziare'}
              </div>
            </div>
          </div>

          <DiceFormulaBuilder
            items={items}
            itemErrors={validation.itemErrors}
            onChange={setItems}
          />

          {validation.issues.some((issue) => !issue.itemId) && items.length > 0 && (
            <div className="mt-2 text-xs text-red-400">
              {validation.issues.filter((issue) => !issue.itemId).map((issue) => issue.message).join(' ')}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-dice-roll-builder
              disabled={!validation.valid}
              onClick={runBuilder}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Tira
            </button>
            <button
              type="button"
              data-dice-save-formula
              disabled={!validation.valid || saving}
              onClick={() => { void saveBuilder(); }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-2 text-sm text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salva formula
            </button>
            <button
              type="button"
              data-dice-clear-builder
              onClick={clearBuilder}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--dash-border)] px-4 py-2 text-sm text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]"
            >
              <Trash2 className="h-4 w-4" />
              Svuota
            </button>
          </div>
        </section>

        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--dash-text-strong)]">Formule salvate</h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--dash-muted)]" />}
          </div>

          {formulas.length === 0 && !loading ? (
            <div className="rounded-xl border border-dashed border-[var(--dash-border)] p-8 text-center text-sm text-[var(--dash-muted)]">
              <Dices className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nessuna formula salvata in questa campagna.
            </div>
          ) : (
            <div className="space-y-2">
              {formulas.map((formula) => (
                <SavedDiceFormulaCard
                  key={formula.id}
                  formula={formula}
                  onRoll={() => rollSaved(formula)}
                  onToggleSecret={() => { void toggleSecret(formula); }}
                  onEdit={() => editFormula(formula)}
                  onDuplicate={() => { void duplicateFormula(formula); }}
                  onDelete={() => setDeleteTarget(formula)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Elimina formula"
          message={`Vuoi eliminare definitivamente la formula “${deleteTarget.name}”?`}
          confirmLabel="Elimina"
          onConfirm={() => { void confirmDelete(); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
