import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const card = read('src/app/components/session/dice/SavedDiceFormulaCard.tsx');
const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const context = read('src/app/components/session/dice/DiceSessionContext.tsx');
const types = read('src/app/components/session/dice/diceTypes.ts');
const service = read('src/services/supabase/diceFormulasService.ts');

assert.match(
  card,
  /<DropdownMenuContent[\s\S]*?className="[^"]*z-\[1000\][^"]*"/,
  'saved dice formula menu must render above the z-[900] dice slide-over panel',
);
assert.ok(card.includes('bg-[var(--dash-panel)]'), 'saved dice menu must use the active dashboard panel palette');
assert.ok(card.includes('border-[var(--dash-border)]'), 'saved dice menu must use the active dashboard border palette');
assert.ok(card.includes('text-[var(--dash-text)]'), 'saved dice menu must use the active dashboard text palette');
assert.ok(card.includes('focus:bg-[var(--dash-surface-2)]'), 'saved dice menu focus states must follow the active palette');

for (const label of ['Modifica', 'Duplica', 'Icona', 'Elimina']) {
  assert.match(card, new RegExp(`\\n\\s*${label}\\n`), `saved dice menu must expose the short label ${label}`);
}
assert.doesNotMatch(card, /\n\s*(Modifica|Duplica|Elimina) formula\n/, 'saved dice menu labels must not repeat the word formula');

assert.ok(card.includes("import { NoteIconGlyph, NoteIconGrid } from '../shared/NoteIconGrid';"), 'saved dice cards must reuse the shared Hollowgate icon catalog');
assert.ok(card.includes('data-dice-formula-icon'), 'saved dice menu must expose the icon action');
assert.ok(card.includes('<NoteIconGrid'), 'saved dice icon action must open the shared icon picker');
assert.ok(card.includes('z-[1100]'), 'saved dice icon picker must render above the dice panel and its menu');
assert.doesNotMatch(card, /from '\.\.\/\.\.\/ui\/popover'/, 'saved dice icon picker must not use Radix Popover lifecycle');
assert.ok(card.includes("import { createPortal } from 'react-dom';"), 'saved dice icon picker must use a plain React portal');
assert.ok(card.includes("import { usePortalContainer } from '../../ui/portal-container';"), 'saved dice icon picker must stay inside the active palette portal container');
assert.ok(card.includes("document.addEventListener('pointerdown'"), 'saved dice icon picker must own outside-click dismissal');
assert.ok(card.includes("event.key === 'Escape'"), 'saved dice icon picker must own Escape dismissal');
assert.doesNotMatch(card, /requestAnimationFrame/, 'saved dice icon picker must not depend on timing hacks');
assert.ok(card.includes('data-dice-icon-picker'), 'saved dice icon picker must expose a stable regression target');
assert.match(card, /formula\.iconName\s*\?\s*\([\s\S]*?<NoteIconGlyph[\s\S]*?:\s*\([\s\S]*?<Dices/, 'saved dice cards must show the chosen icon and keep Dices as the fallback');
assert.ok(card.includes('onRemove={formula.iconName ? removeIcon : undefined}'), 'chosen saved dice icons must be removable');

assert.ok(types.includes('iconName?: string | null;'), 'saved dice formula type must carry an optional persisted icon');
assert.equal((types.match(/formulaIconName\?: string;/g) ?? []).length, 2, 'roll request and roll result must both carry an optional custom formula icon');
assert.ok(service.includes('icon_name: string | null;'), 'Supabase row mapping must include icon_name');
assert.ok(service.includes('iconName?: string | null;'), 'formula write contracts must allow setting or clearing an icon');
assert.ok(service.includes('iconName: row.icon_name'), 'formula loads must map icon_name to iconName');
assert.ok(service.includes('icon_name: input.iconName ?? null'), 'formula creates must persist the chosen icon');
assert.ok(service.includes('payload.icon_name = patch.iconName'), 'formula updates must persist icon changes');
assert.ok(service.includes('iconName: formula.iconName'), 'formula duplication must preserve the chosen icon');

assert.ok(panel.includes('const setFormulaIcon = async'), 'dice panel must own icon persistence and rollback');
assert.ok(panel.includes("updateDiceFormula(formula.id, { iconName })"), 'dice panel must persist icon changes through the formula service');
assert.ok(panel.includes('iconName: formula.iconName'), 'manual formula duplication must preserve icons');
assert.ok(panel.includes('onIconChange={(iconName) => { void setFormulaIcon(formula, iconName); }}'), 'saved formula cards must wire icon changes back to the panel');
assert.ok(panel.includes('formulaIconName: formula.iconName ?? undefined'), 'saved formula rolls must pass only a custom icon to the roll request');

assert.ok(context.includes('formulaIconName: request.formulaIconName'), 'roll results must preserve the custom formula icon for realtime chat');
assert.ok(context.includes('formulaIconName: previous.formulaIconName'), 'rerolls must preserve the original formula icon');
assert.ok(historyCard.includes("import { NoteIconGlyph } from '../shared/NoteIconGrid';"), 'roll chat must reuse the shared Hollowgate icon renderer');
assert.ok(historyCard.includes('result.formulaIconName &&'), 'roll chat must render an icon only when a custom icon exists');
assert.ok(historyCard.includes('data-dice-roll-formula-icon'), 'roll chat custom icons must expose a stable regression target');
assert.match(
  historyCard,
  /result\.formulaIconName\s*&&\s*\([\s\S]*?<NoteIconGlyph[\s\S]*?name=\{result\.formulaIconName\}/,
  'roll chat must show the selected custom icon next to the saved formula name',
);

console.log('Saved dice formula menu, icon picker, and roll chat icon verification passed.');
