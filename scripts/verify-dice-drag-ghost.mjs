import assert from 'node:assert/strict';
import fs from 'node:fs';

const row = fs.readFileSync(new URL('../src/app/components/session/dice/DiceFormulaRow.tsx', import.meta.url), 'utf8');

assert.ok(row.includes("ghost.style.opacity = '0.95'"), 'drag ghost must stay clearly visible');
assert.ok(row.includes('window.getComputedStyle(event.currentTarget)'), 'drag ghost must read resolved palette styles');
assert.ok(row.includes("'--dash-surface'"), 'drag ghost must preserve palette variables');
assert.ok(row.includes('ghost.style.setProperty(property, value)'), 'drag ghost must copy palette variables');
assert.ok(row.includes("ghost.style.backgroundColor = sourceStyle.backgroundColor"), 'drag ghost must preserve resolved background');
assert.ok(row.includes("ghost.style.color = sourceStyle.color"), 'drag ghost must preserve resolved text color');
assert.ok(row.includes("ghost.style.borderColor = sourceStyle.borderColor"), 'drag ghost must preserve resolved border');
assert.ok(row.includes("ghost.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.28)'"), 'drag ghost must look lifted');
assert.ok(row.includes("isDragging ? 'opacity-65'"), 'source row must remain visible while dragging');

console.log('Dice drag ghost visibility verification passed.');
