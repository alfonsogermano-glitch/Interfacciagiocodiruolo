import assert from 'node:assert/strict';
import { rollResultSummary } from '../src/app/components/session/dice/diceResultSummary.ts';

function roll(partial: Record<string, unknown>) {
  return {
    id: 'r1',
    campaignId: 'c1',
    rollerId: 'u1',
    rollerName: 'Alfonso',
    formulaName: 'Tiro',
    formulaText: '1d20',
    visibility: 'public',
    sourceItems: [],
    diceGroups: [],
    arithmeticSteps: [],
    comparisons: [],
    total: 0,
    createdAt: 0,
    ...partial,
  } as Parameters<typeof rollResultSummary>[0];
}

function die(partial: Record<string, unknown>) {
  return {
    id: 'd1',
    groupItemId: 'i1',
    sides: 6,
    face: 1,
    contribution: null,
    active: true,
    source: 'base',
    explosionDepth: 0,
    chainId: 'c',
    ...partial,
  } as never;
}

function group(rolls: unknown[]) {
  return {
    itemId: 'i1',
    sides: 6,
    requestedQuantity: rolls.length,
    rolls,
    activeRollIds: [],
    contribution: null,
  } as never;
}

function face(partial: Record<string, unknown>) {
  return {
    index: 1,
    role: 'single',
    visual: { kind: 'text', text: '' },
    numericValue: null,
    ...partial,
  } as never;
}

// Tiri numerici: com'e' sempre stato (formula -> totale).
assert.equal(rollResultSummary(roll({ formulaText: '5d20', total: 12 })), '5d20 → 12');
assert.equal(rollResultSummary(roll({ formulaText: '1d20', total: -0 })), '1d20 → 0');

// Dado custom a facce: il totale e' null -> le facce uscite in testo.
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado Fortuna',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ visual: { kind: 'text', text: 'Dragone' } }) }),
    ])],
  })),
  'Dado Fortuna → Dragone',
);

// L'etichetta della faccia prevale sul testo.
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ label: 'Furia', visual: { kind: 'text', text: 'Dragone' } }) }),
    ])],
  })),
  'Dado → Furia',
);

// Facce solo visive: icona -> nome icona, immagine senza etichetta -> "faccia N".
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado Emblemi',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ index: 4, visual: { kind: 'icon', iconName: 'Star' } }) }),
      die({ face: 7, customFace: face({ index: 7, visual: { kind: 'image', assetPath: 'x', publicUrl: 'y' } }) }),
    ])],
  })),
  'Dado Emblemi → Star, faccia 7',
);

// Ripetizioni: la stessa faccia due volte -> "x2".
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado Fortuna',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ visual: { kind: 'text', text: 'Dragone' } }) }),
      die({ face: 2, customFace: face({ index: 2, visual: { kind: 'text', text: 'Dragone' } }) }),
    ])],
  })),
  'Dado Fortuna → Dragone ×2',
);

// La coppia unita del percentile (physicalRole "units") non viene ripetuta.
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado Simbolico',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ index: 3, label: 'Pranzo' }) }),
      die({ face: 5, physicalRole: 'units', customFace: face({ index: 5, label: 'Seduto' }) }),
    ])],
  })),
  'Dado Simbolico → Pranzo',
);

// Faccia custom senza etichetta ne' testo: fallback "faccia N".
assert.equal(
  rollResultSummary(roll({
    formulaText: 'Dado Vuoto',
    total: null,
    diceGroups: [group([
      die({ customFace: face({ index: 6, visual: { kind: 'image', assetPath: 'x', publicUrl: 'y' } }) }),
    ])],
  })),
  'Dado Vuoto → faccia 6',
);

// Nessun gruppo: solo la formula, mai "null".
assert.equal(rollResultSummary(roll({ formulaText: '', formulaName: 'Mio tiro', total: null })), 'Mio tiro');
assert.equal(rollResultSummary(roll({ formulaText: '', formulaName: '', total: null })), 'Tiro');

console.log('Chat roll text summary verification: PASS');
