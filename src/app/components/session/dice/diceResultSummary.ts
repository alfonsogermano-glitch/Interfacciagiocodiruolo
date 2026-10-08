import type { RollDie, RollResult } from './diceTypes.ts';
function formatResultNumber(value:number){if(Object.is(value,-0))return'0';return Number.isInteger(value)?String(value):String(Number(value.toFixed(6)))}
export function getKeepCount(result:RollResult):number{return result.diceGroups.reduce((count,group)=>count+group.rolls.filter(die=>die.active&&die.keepMatched===true&&die.physicalRole!=='units').length,0)}
export function formatPrimaryRollResult(result:RollResult):string|null{if(result.total===null)return null;const total=formatResultNumber(result.total);const hasKeep=result.sourceItems.some(item=>item.kind==='keep');return hasKeep?`${getKeepCount(result)} (${total})`:total}

/** Testo leggibile di una faccia per le sintesi (citazione/copiatura): prima
 l'etichetta, poi il testo della faccia; per facce solo visive il nome
 dell'icona oppure "faccia N" (immagini senza etichetta). */
function dieFaceText(die: RollDie): string {
  const custom = die.customFace;
  if (custom) {
    const label = custom.label?.trim();
    if (label) return label;
    if (custom.visual.kind === 'text') {
      const text = custom.visual.text.trim();
      if (text) return text;
    }
    if (custom.visual.kind === 'icon') return custom.visual.iconName;
    return `faccia ${custom.index}`;
  }
  return String(die.face);
}

/** Sintesi testuale del risultato per citazioni e copiatura: il totale per i
 tiri numerici (1d6, 5d20...), le facce uscite (ripetizioni "xN") per i dadi
 custom o a immagini che non hanno un totale traducibile. Mai "null". */
export function rollResultSummary(result: RollResult): string {
  const formula = result.formulaText || result.formulaName || 'Tiro';
  const primary = formatPrimaryRollResult(result);
  if (primary !== null) return `${formula} → ${primary}`;
  const counts = new Map<string, number>();
  for (const group of result.diceGroups) {
    for (const die of group.rolls) {
      if (!die.active || die.physicalRole === 'units') continue;
      const text = dieFaceText(die);
      if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return formula;
  const faces = [...counts].map(([text, count]) => (count > 1 ? `${text} ×${count}` : text));
  return `${formula} → ${faces.join(', ')}`;
}
