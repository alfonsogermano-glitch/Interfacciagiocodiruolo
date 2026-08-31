import assert from 'node:assert/strict';
import fs from 'node:fs';
const card = fs.readFileSync(new URL('../src/app/components/session/dice/SavedDiceFormulaCard.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(card, /from '\.\.\/\.\.\/ui\/popover'/, 'picker must not use Radix Popover');
assert.ok(card.includes("import { createPortal } from 'react-dom';"), 'picker must use a plain React portal');
assert.ok(card.includes('usePortalContainer'), 'picker must keep palette inheritance through the shared portal container');
assert.ok(card.includes("document.addEventListener('pointerdown'"), 'picker must own outside-click dismissal');
assert.ok(card.includes("event.key === 'Escape'"), 'picker must own Escape dismissal');
console.log('picker lifetime regression passed');
