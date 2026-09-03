import { Dices, EyeOff, RotateCcw } from 'lucide-react';
import { useAuth } from '../../../auth/AuthContext';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { NoteIconGlyph } from '../shared/NoteIconGrid';
import type { DiceAppearance, RollComparisonResult, RollResult } from './diceTypes.ts';
import { formatPrimaryRollResult } from './diceResultSummary.ts';
import { CustomDieFaceResult } from './CustomDieFaceResult';
import { DiceTypeIcon } from './DiceTypeIcon';
import { StyledStandardDieIcon } from './StyledStandardDieIcon';
import { useDiceAppearance } from './DiceAppearanceContext';

const CHAT_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
type ChatDieSides = (typeof CHAT_DIE_SIDES)[number];

function isChatDieSides(sides: number): sides is ChatDieSides {
  return (CHAT_DIE_SIDES as readonly number[]).includes(sides);
}

function StandardDieResult({
  sides,
  face,
  contribution,
  appearance,
}: {
  sides: number;
  face: number;
  contribution: number | null;
  appearance?: DiceAppearance;
}) {
  return (
    <>
      {isChatDieSides(sides)
        ? appearance
          ? <StyledStandardDieIcon sides={sides} appearance={appearance} className={sides === 100 ? 'h-[20px] w-[38px]' : 'h-[20px] w-[20px]'} />
          : <DiceTypeIcon sides={sides} className={sides === 100 ? 'h-[20px] !gap-px [&>img]:!h-[20px] [&>img]:!w-[20px]' : 'h-[20px] w-[20px]'} />
        : <><Dices className="h-[20px] w-[20px]" /><span>d{sides}</span></>}
      <span>: {face}</span>
      {contribution !== face && <span className="text-[10px]">({contribution})</span>}
    </>
  );
}

function CompareOutcome({ result }: { result: RollComparisonResult }) {
  if (result.success !== undefined) {
    return <span className={`text-xs font-semibold ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>{result.success ? 'Successo' : 'Fallimento'}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5 text-xs font-semibold">
      {(result.successes ?? 0) > 0 && <span className="text-emerald-400">{result.successes} Successi</span>}
      {(result.failures ?? 0) > 0 && <span className="text-red-400">{result.failures} Fallimenti</span>}
    </span>
  );
}

export function DiceRollHistoryCard({ result, onReroll }: { result: RollResult; onReroll: () => void }) {
  const primary = formatPrimaryRollResult(result);
  const { user } = useAuth();
  const { getStandardAppearance } = useDiceAppearance();
  return (
    <article data-dice-roll-history-card className="rounded-lg border border-[var(--dash-border)] bg-[var(--dash-panel)]/95 p-2 shadow-md">
      <div className="flex items-stretch gap-2">
        <div data-dice-player-actions className="flex self-stretch shrink-0 flex-col items-center gap-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
            {result.rollerAvatarUrl
              ? <img src={result.rollerAvatarUrl} alt="" className="h-full w-full object-cover" />
              : <span className="text-xs font-semibold text-[var(--dash-text)]">{result.rollerName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" data-dice-reroll onClick={onReroll} aria-label="Ritira" className="mt-auto rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] p-1 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)]">
                <RotateCcw className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Ritira</TooltipContent>
          </Tooltip>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="break-words text-sm font-semibold leading-tight text-[var(--dash-text-strong)]">{result.rollerName}</div>
              {(result.formulaId || result.visibility === 'secret') && (
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                  {result.formulaId && (
                    <div className="flex min-w-[8rem] flex-1 items-center gap-1.5 break-words text-xs leading-tight text-[var(--dash-muted)]">
                      {result.formulaIconName && <NoteIconGlyph name={result.formulaIconName} data-dice-roll-formula-icon className="h-3.5 w-3.5 shrink-0 text-[var(--dash-accent)]" />}
                      <span className="min-w-0 break-words">{result.formulaName}</span>
                    </div>
                  )}
                  {result.visibility === 'secret' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span data-dice-roll-secret className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--dash-border)] bg-[var(--dash-input)] px-1 py-0.5 text-[10px] font-medium leading-none text-[var(--dash-muted)]">
                          <EyeOff className="h-2.5 w-2.5" />Segreto
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Tiro segreto</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
            {primary !== null && primary !== '' && (
              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase leading-none tracking-wide text-[var(--dash-muted)]">Totale</div>
                <div className="mt-0.5 text-xl font-bold leading-none text-[var(--dash-text-strong)]">{primary}</div>
              </div>
            )}
          </div>
          <div className="mt-1 break-words whitespace-pre-wrap rounded bg-[var(--dash-input)] px-1.5 py-0.5 font-mono text-[11px] leading-tight text-[var(--dash-text)]">{result.formulaText}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {result.diceGroups.flatMap((group) => group.rolls.map((die) => {
              const tooltip = `${die.customDieName ?? (die.source === 'explosion' ? 'Rilancio esplosivo' : `d${die.sides}`)}${die.active ? '' : ' - escluso'}`;
              const liveStandardAppearance = !die.customFace
                && result.rollerId === user?.id
                && isChatDieSides(die.sides)
                ? getStandardAppearance(die.sides)
                : group.appearance;
              return (
                <Tooltip key={die.id}>
                  <TooltipTrigger asChild>
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none ${die.active ? 'border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-text)]' : 'border-[var(--dash-border-soft)] bg-[var(--dash-surface)] text-[var(--dash-muted)] line-through opacity-60'}`}>
                      {die.customFace
                        ? <>
                          <CustomDieFaceResult
                            face={die.customFace}
                            className="h-[20px] w-[20px]"
                            symbolColor={die.customFace.symbolColor ?? group.customDieSnapshot?.symbolColor}
                            bodyColor={group.customDieSnapshot?.bodyColor}
                            skinId={group.customDieSnapshot?.skinId ?? 'none'}
                          />
                          {die.customFace.label && <span>{die.customFace.label}</span>}
                          {die.customFace.numericValue !== null && <span className="text-[10px]">({die.customFace.numericValue})</span>}
                        </>
                        : <StandardDieResult sides={die.sides} face={die.face} contribution={die.contribution} appearance={liveStandardAppearance} />}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{tooltip}</TooltipContent>
                </Tooltip>
              );
            }))}
          </div>
          {result.comparisons.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
              {result.comparisons.map((comparison) => <CompareOutcome key={comparison.itemId} result={comparison} />)}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
