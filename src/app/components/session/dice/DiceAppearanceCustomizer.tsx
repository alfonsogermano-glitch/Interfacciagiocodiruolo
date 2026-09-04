import { useMemo, useState } from 'react';
import { Loader2, Palette, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../../ui/switch';
import { DiceSkinSurface } from './DiceSkinSurface';
import { StyledStandardDieIcon } from './StyledStandardDieIcon';
import { useDiceAppearance } from './DiceAppearanceContext';
import { DICE_SKINS } from './diceSkins.ts';
import { MAX_DICE_TEXTURE_SCALE, MIN_DICE_TEXTURE_SCALE } from './diceTextureScale.ts';
import type { CustomDieSides, StandardDieAppearance } from './diceTypes.ts';

const STANDARD_SIDES: readonly CustomDieSides[] = [4, 6, 8, 10, 12, 20, 100] as const;

function cloneStyles(styles: readonly StandardDieAppearance[]) {
  return styles.map((style) => ({ ...style }));
}

export function DiceAppearanceCustomizer({ onClose }: { onClose: () => void }) {
  const { styles, saveStyles } = useDiceAppearance();
  const [selectedSides, setSelectedSides] = useState<CustomDieSides>(20);
  const [draft, setDraft] = useState<StandardDieAppearance[]>(() => cloneStyles(styles));
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => draft.find((style) => style.sides === selectedSides) ?? draft[0],
    [draft, selectedSides],
  );

  const patchSelected = (patch: Partial<Omit<StandardDieAppearance, 'sides'>>) => {
    setDraft((current) => current.map((style) => style.sides === selectedSides ? { ...style, ...patch } : style));
  };

  const applyToAll = () => {
    if (!selected) return;
    setDraft((current) => current.map((style) => ({
      sides: style.sides,
      bodyColor: selected.bodyColor,
      symbolColor: selected.symbolColor,
      skinId: selected.skinId,
      effectsEnabled: selected.effectsEnabled,
      textureScale: selected.textureScale,
    })));
  };

  if (!selected) return null;

  return (
    <div data-dice-appearance-customizer className="fixed inset-0 z-[1250] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-panel)] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[var(--dash-border)] p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-input)] text-[var(--dash-accent)]">
            <Palette className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-[var(--dash-text-strong)]">Personalizza dadi</div>
            <div className="text-xs text-[var(--dash-muted)]">Stile personale per questa campagna</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-2 text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:grid-cols-[220px_1fr]">
          <aside className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--dash-muted)]">Dado</div>
              <div className="grid grid-cols-4 gap-1.5 md:grid-cols-2">
                {STANDARD_SIDES.map((sides) => (
                  <button
                    key={sides}
                    type="button"
                    data-dice-appearance-side={sides}
                    onClick={() => setSelectedSides(sides)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold ${selectedSides === sides ? 'border-[var(--dash-accent)] bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : 'border-[var(--dash-border)] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]'}`}
                  >
                    d{sides}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4">
              <div className="mb-3 text-center text-xs text-[var(--dash-muted)]">Anteprima d{selected.sides}</div>
              <div data-dice-appearance-main-preview className="flex min-h-28 items-center justify-center overflow-visible">
                <StyledStandardDieIcon
                  sides={selected.sides}
                  appearance={selected}
                  previewSkinArt
                  className={selected.sides === 100 ? 'h-24 w-44' : 'h-24 w-24'}
                />
              </div>
            </div>

            <label className="block rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--dash-muted)]">Zoom texture</span>
                <span data-dice-appearance-texture-scale-value className="text-xs font-semibold tabular-nums text-[var(--dash-text-strong)]">{selected.textureScale}%</span>
              </div>
              <input
                data-dice-appearance-texture-scale
                aria-label="Zoom texture"
                type="range"
                min={MIN_DICE_TEXTURE_SCALE}
                max={MAX_DICE_TEXTURE_SCALE}
                step={1}
                value={selected.textureScale}
                onChange={(event) => patchSelected({ textureScale: Number(event.target.value) })}
                className="mt-2 w-full cursor-pointer"
                style={{ accentColor: 'var(--dash-accent)' }}
              />
              <div className="mt-1 flex justify-between text-[9px] text-[var(--dash-muted)]">
                <span>{MIN_DICE_TEXTURE_SCALE}%</span>
                <span>{MAX_DICE_TEXTURE_SCALE}%</span>
              </div>
            </label>

            <button
              type="button"
              data-dice-appearance-apply-all
              onClick={applyToAll}
              className="w-full rounded-lg border border-[var(--dash-border)] px-3 py-2 text-xs font-semibold text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              Applica a tutti
            </button>
          </aside>

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-[var(--dash-muted)]">
                Colore dado
                <input data-dice-appearance-body-color type="color" value={selected.bodyColor} onChange={(event) => patchSelected({ bodyColor: event.target.value })} className="mt-1 h-10 w-full" />
              </label>
              <label className="block text-xs text-[var(--dash-muted)]">
                Colore numeri
                <input data-dice-appearance-symbol-color type="color" value={selected.symbolColor} onChange={(event) => patchSelected({ symbolColor: event.target.value })} className="mt-1 h-10 w-full" />
              </label>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--dash-muted)]">Skin</div>
              <div className="grid grid-cols-3 gap-2">
                {DICE_SKINS.map((skin) => {
                  const preview = { ...selected, skinId: skin.id };
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      data-dice-skin-option={skin.id}
                      aria-pressed={selected.skinId === skin.id}
                      onClick={() => patchSelected({ skinId: skin.id })}
                      className={`rounded-xl border p-2 text-left ${selected.skinId === skin.id ? 'border-[var(--dash-accent)] ring-1 ring-[var(--dash-accent)]/40' : 'border-[var(--dash-border)] hover:bg-[var(--dash-surface-2)]'}`}
                    >
                      <DiceSkinSurface
                        appearance={preview}
                        illustrative
                        className="mb-1.5 block h-10 w-full rounded-md border border-black/15"
                      />
                      <div className="text-[11px] font-semibold text-[var(--dash-text-strong)]">{skin.label}</div>
                      <div className="truncate text-[9px] text-[var(--dash-muted)]">{skin.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-[var(--dash-text-strong)]">Effetti animati</div>
                <div className="text-[10px] text-[var(--dash-muted)]">Attivi durante il lancio 3D</div>
              </div>
              <Switch data-dice-appearance-effects checked={selected.effectsEnabled} onCheckedChange={(checked) => patchSelected({ effectsEnabled: checked })} />
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--dash-border)] p-4">
          <button type="button" data-dice-appearance-cancel disabled={busy} onClick={onClose} className="rounded-lg border border-[var(--dash-border)] px-4 py-2 text-sm text-[var(--dash-muted)] disabled:opacity-40">Annulla</button>
          <button
            type="button"
            data-dice-appearance-save
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void saveStyles(draft)
                .then(() => { toast.success('Personalizzazione dadi salvata.'); onClose(); })
                .catch((error) => { console.error(error); toast.error(error instanceof Error ? error.message : 'Impossibile salvare la personalizzazione dei dadi.'); })
                .finally(() => setBusy(false));
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--dash-accent)] px-4 py-2 text-sm font-semibold text-[var(--dash-text-strong)] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salva
          </button>
        </footer>
      </div>
    </div>
  );
}
