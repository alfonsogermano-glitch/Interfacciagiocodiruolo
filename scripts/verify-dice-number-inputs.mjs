import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(
  new URL('../src/app/components/session/sessionPanelResize.css', import.meta.url),
  'utf8',
);

assert.match(
  css,
  /\[data-dice-formula-row\]\s+input\[type=['"]number['"]\]\s*\{[\s\S]*?-moz-appearance:\s*textfield/,
  'Firefox native number spinners must be hidden only inside dice formula rows',
);
assert.match(
  css,
  /\[data-dice-formula-row\]\s+input\[type=['"]number['"]\]::-webkit-inner-spin-button[\s\S]*?\[data-dice-formula-row\]\s+input\[type=['"]number['"]\]::-webkit-outer-spin-button[\s\S]*?\{[\s\S]*?-webkit-appearance:\s*none/,
  'WebKit native number spinners must be hidden only inside dice formula rows',
);

console.log('Dice numeric input spinner verification: PASS');
