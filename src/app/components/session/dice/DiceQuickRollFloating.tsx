import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Dices, Eye, EyeOff, Minus, Play, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { CUSTOM_DICE_LIBRARY_CHANGED_EVENT, loadCustomDice } from '../../../../services/supabase/diceCustomDiceService';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { CustomDiceQuestionIcon } from './CustomDiceQuestionIcon';
import { CustomDieLibraryIcon } from './CustomDieLibraryIcon';
import { DiceTypeIcon } from './DiceTypeIcon';
import { useDiceSession } from './DiceSessionContext';
import { addCustomQuickDie, addStandardQuickDie, buildQuickRollItems, clearQuickRoll, decrementQuickDie, type QuickRollEntry } from './diceQuickRollState.ts';
import type { DiceVisibility, SavedCustomDie } from './diceTypes.ts';

const SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
const MAX_CUSTOM_DICE_ROWS = 5;

export function DiceQuickRollFloating() {
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const { submitLocalRoll, historyOpen, historyUnread, openHistory, closeHistory } = useDiceSession();
  const [open, setOpen] = useState(false);
  const [selector, setSelector] = useState(false);
  const [entries, setEntries] = useState<QuickRollEntry[]>([]);
  const [customDice, setCustomDice] = useState<SavedCustomDie[]>([]);
  const [visibility, setVisibility] = useState<DiceVisibility>('public');

  const reload = useCallback(async () => {
    if (!user?.id || !activeCampaign?.id) {
      setCustomDice([]);
      return;
    }
    try {
      setCustomDice(await loadCustomDice(activeCampaign.id, user.id));
    } catch (error) {
      console.error(error);
    }
  }, [activeCampaign?.id, user?.id]);

  useEffect(() => {
    setEntries([]);
    setOpen(false);
    setSelector(false);
    void reload();
  }, [activeCampaign?.id, reload]);

  useEffect(() => {
    const handleChanged = () => {
      void reload();
    };
    window.addEventListener(CUSTOM_DICE_LIBRARY_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(CUSTOM_DICE_LIBRARY_CHANGED_EVENT, handleChanged);
  }, [reload]);

  const qty = (side: number) => entries.find((entry) => entry.kind === 'dice' && entry.sides === side)?.quantity ?? 0;
  const customEntries = entries.filter(
    (entry): entry is Extract<QuickRollEntry, { kind: 'custom-die' }> => entry.kind === 'custom-die',
  );

  const roll = () => {
    if (entries.length === 0) return;
    try {
      const items = buildQuickRollItems(entries, customDice);
      submitLocalRoll({ items, formulaName: 'Tiro rapido', visibility });
      setEntries(clearQuickRoll());
      setOpen(false);
      setSelector(false);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Errore durante il tiro rapido.');
    }
  };

  const customGridRows = Math.min(MAX_CUSTOM_DICE_ROWS, Math.max(1, customDice.length));

  return (
    <div className="fixed bottom-5 left-28 z-[945] flex items-center gap-2" data-dice-quick-roll-floating>
      <button
        type="button"
        data-dice-history-toggle
        onClick={() => historyOpen ? closeHistory() : openHistory()}
        aria-label={historyOpen ? 'Nascondi storico tiri' : 'Mostra storico tiri'}
        className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-panel)] text-[var(--dash-text)] shadow-lg"
      >
        {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {historyUnread && !historyOpen && (
          <span
            data-dice-history-unread
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--dash-accent)] ring-1 ring-[var(--dash-bg)]"
          />
        )}
      </button>

      <button
        type="button"
        data-dice-quick-toggle
        onClick={() => setOpen((value) => {
          const next = !value;
          if (!next) setSelector(false);
          return next;
        })}
        aria-label="Tiro rapido"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--dash-border)] bg-[var(--dash-accent)] text-[var(--dash-text-strong)] shadow-xl transition-transform hover:scale-105"
      >
        <Dices className="h-7 w-7" />
      </button>

      {open && (
        <div
          data-dice-quick-palette
          className="flex min-w-0 max-w-[calc(100vw-20rem)] select-none flex-nowrap items-center gap-2 overflow-x-auto rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 px-2 py-1 shadow-2xl backdrop-blur-md caret-transparent [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            {SIDES.map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setEntries((value) => addStandardQuickDie(value, side))}
                className={`relative flex h-12 ${side === 100 ? 'w-16' : 'w-12'} shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] hover:border-[var(--dash-accent)]`}
              >
                <DiceTypeIcon sides={side} className={side === 100 ? 'h-9 w-14' : 'h-9 w-9'} />
                {qty(side) > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-[var(--dash-accent)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--dash-text-strong)]">
                    {qty(side)}
                  </span>
                )}
              </button>
            ))}

            <Popover open={selector} onOpenChange={setSelector}>
              <PopoverTrigger asChild>
                <button
                  data-dice-custom-toolbar
                  type="button"
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-accent)] hover:border-[var(--dash-accent)]"
                >
                  <CustomDiceQuestionIcon className="h-9 w-9" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                data-dice-custom-selector-popover
                side="top"
                align="center"
                sideOffset={8}
                collisionPadding={8}
                className="z-[1100] w-max min-w-0 max-w-[min(20rem,calc(100vw-2rem))] border-[var(--dash-border)] bg-[var(--dash-panel)] p-1.5 text-[var(--dash-text)] shadow-2xl"
              >
                {customDice.length > 0 ? (
                  <div
                    data-dice-custom-selector-grid
                    className="grid max-w-full grid-flow-col gap-1 overflow-x-auto [scrollbar-width:thin]"
                    style={{ gridTemplateRows: `repeat(${customGridRows}, minmax(0, 1fr))` }}
                  >
                    {customDice.map((die) => (
                      <Tooltip key={die.id}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`${die.name} · d${die.sides}`}
                            onClick={() => {
                              setEntries((value) => addCustomQuickDie(value, die.id));
                              setSelector(false);
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[var(--dash-surface-2)]"
                          >
                            <CustomDieLibraryIcon die={die} size="compact" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="!animate-none">
                          {die.name} · d{die.sides}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-2 text-center text-[10px] text-[var(--dash-muted)]">
                    Nessun dado Custom salvato.
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {customEntries.length > 0 && (
            <div className="flex shrink-0 flex-nowrap items-center gap-1 border-l border-[var(--dash-border)] pl-2">
              {customEntries.map((entry, index) => {
                const label = customDice.find((die) => die.id === entry.customDieId)?.name ?? 'Custom';
                return (
                  <div
                    key={`custom-die-${index}`}
                    data-dice-custom-quick-stepper
                    className="inline-flex shrink-0 items-stretch overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-input)] text-[10px] text-[var(--dash-text)]"
                  >
                    <button
                      type="button"
                      data-dice-custom-quick-increment
                      aria-label={`Aggiungi ${label}`}
                      onClick={() => setEntries((value) => addCustomQuickDie(value, entry.customDieId))}
                      className="flex w-7 items-center justify-center border-r border-[var(--dash-border)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="flex max-w-40 items-center justify-center truncate px-2 py-1" title={`${label} ×${entry.quantity}`}>
                      {label}
                    </span>
                    <button
                      type="button"
                      data-dice-custom-quick-decrement
                      aria-label={`Rimuovi ${label}`}
                      onClick={() => setEntries((value) => decrementQuickDie(value, entry))}
                      className="flex w-7 items-center justify-center border-l border-[var(--dash-border)] hover:bg-[var(--dash-surface-2)]"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 border-l border-[var(--dash-border)] pl-2">
            <button
              aria-label="Svuota tiro rapido"
              onClick={() => setEntries([])}
              className="rounded-lg border border-[var(--dash-border)] p-2 text-[var(--dash-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              aria-label={visibility === 'secret' ? 'Tiro segreto' : 'Tiro pubblico'}
              onClick={() => setVisibility((value) => value === 'public' ? 'secret' : 'public')}
              className={`rounded-lg border border-[var(--dash-border)] p-2 ${visibility === 'secret' ? 'text-[var(--dash-muted)]' : 'text-[var(--dash-accent)]'}`}
            >
              {visibility === 'secret' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              disabled={entries.length === 0}
              onClick={roll}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--dash-accent)] px-4 py-2 text-xs font-semibold text-[var(--dash-text-strong)] disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
              Tira
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
