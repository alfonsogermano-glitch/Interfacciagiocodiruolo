import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const card = read('src/app/components/session/dice/SavedDiceFormulaCard.tsx');
const picker = read('src/app/components/session/dice/DiceLibraryIconPicker.tsx');
const panel = read('src/app/components/session/dice/SessionDicePanel.tsx');
const historyCard = read('src/app/components/session/dice/DiceRollHistoryCard.tsx');
const context = read('src/app/components/session/dice/DiceSessionContext.tsx');
const types = read('src/app/components/session/dice/diceTypes.ts');
const service = read('src/services/supabase/diceFormulasService.ts');

assert.match(card, /<DropdownMenuContent[\s\S]*?className="[^"]*z-\[1000\][^"]*"/, 'saved dice formula menu must render above the z-[900] dice slide-over panel');
assert.ok(card.includes('bg-[var(--dash-panel)]'), 'saved dice menu must use the active dashboard panel palette');
assert.ok(card.includes('border-[var(--dash-border)]'), 'saved dice menu must use the active dashboard border palette');
assert.ok(card.includes('text-[var(--dash-text)]'), 'saved dice menu must use the active dashboard text palette');
assert.ok(card.includes('focus:bg-[var(--dash-surface-2)]'), 'saved dice menu focus states must follow the active palette');
assert.ok(card.includes('caret-transparent'), 'saved dice cards must not show a blinking text caret');

for (const label of ['Modifica', 'Duplica', 'Icona', 'Elimina']) {
  assert.ok(card.includes(label), `saved dice menu must expose the short label ${label}`);
}
assert.doesNotMatch(card, /(Modifica|Duplica|Elimina) formula/, 'saved dice menu labels must not repeat the word formula');

assert.ok(card.includes("import { NoteIconGlyph } from '../shared/NoteIconGrid';"), 'saved dice cards must reuse the shared Hollowgate icon renderer');
assert.ok(card.includes("import { DiceLibraryIconPicker } from './DiceLibraryIconPicker';"), 'saved formula icon editing must use the stable shared picker');
assert.ok(card.includes('data-dice-formula-icon'), 'saved dice menu must expose the icon action');
assert.ok(picker.includes('<NoteIconGrid'), 'saved dice icon action must open the shared icon grid');
assert.ok(picker.includes('z-[1100]'), 'saved dice icon picker must render above the dice panel and its menu');
assert.doesNotMatch(picker, /from '\.\.\/\.\.\/ui\/popover'/, 'saved dice icon picker must not use Radix Popover lifecycle');
assert.ok(picker.includes("import { createPortal } from 'react-dom';"), 'saved dice icon picker must use a plain React portal');
assert.ok(picker.includes("import { usePortalContainer } from '../../ui/portal-container';"), 'saved dice icon picker must stay inside the active palette portal container');
assert.ok(picker.includes("document.addEventListener('pointerdown'"), 'saved dice icon picker must own outside-click dismissal');
assert.ok(picker.includes("event.key === 'Escape'"), 'saved dice icon picker must own Escape dismissal');
assert.doesNotMatch(picker, /requestAnimationFrame/, 'saved dice icon picker must not depend on timing hacks');
assert.ok(picker.includes('data-dice-icon-picker'), 'saved dice icon picker must expose a stable regression target');
assert.match(card, /formula\.iconName\s*\?\s*<NoteIconGlyph[\s\S]*?:\s*<Dices/, 'saved dice cards must show the chosen icon and keep Dices as the fallback');
assert.ok(card.includes('onRemove={formula.iconName ?'), 'chosen saved dice icons must be removable');

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
assert.ok(panel.includes('formulaIconName: formula.iconName ?? undefined'), 'saved formula rolls must pass only a custom icon to the roll request');

assert.ok(context.includes('formulaIconName: request.formulaIconName'), 'roll results must preserve the custom formula icon for realtime chat');
assert.ok(context.includes('formulaIconName: previous.formulaIconName'), 'rerolls must preserve the original formula icon');
assert.ok(historyCard.includes("import { NoteIconGlyph } from '../shared/NoteIconGrid';"), 'roll chat must reuse the shared Hollowgate icon renderer');
assert.ok(historyCard.includes('result.formulaIconName &&'), 'roll chat must render an icon only when a custom icon exists');
assert.ok(historyCard.includes('data-dice-roll-formula-icon'), 'roll chat custom icons must expose a stable regression target');

console.log('Saved dice formula menu, icon picker, and roll chat icon verification passed.');
