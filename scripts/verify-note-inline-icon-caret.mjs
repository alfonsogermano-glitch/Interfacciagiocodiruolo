import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/app/components/session/shared/tiptapInlineIcon.ts', import.meta.url), 'utf8');

assert.match(
  source,
  /function buildIconWidget\([\s\S]*document\.createElement\('span'\)[\s\S]*className\s*=\s*'tiptap-inline-icon-widget'/,
  'inline icon must use an HTML span widget like checkbox/radio so the caret can render before a leading icon',
);
assert.match(
  source,
  /function buildIconWidget\([\s\S]*userSelect\s*=\s*'text'/,
  'editable inline icon widget must expose text-selection caret geometry like checkbox/radio',
);
assert.match(
  source,
  /Decoration\.widget\([\s\S]*buildIconWidget\(iconName\)/,
  'inline icon decoration must render the caret-compatible wrapper widget',
);

console.log('Inline icon leading-caret verification: PASS');
