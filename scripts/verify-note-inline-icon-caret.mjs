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
assert.match(
  source,
  /nudgeToRightOfTrailingIcon[\s\S]*TextSelection\.create[\s\S]*pos \+ 1/,
  'inline icon must keep the caret to the right of an icon that is the last character of its block when clicked to the right',
);
assert.match(
  source,
  /handleDOMEvents[\s\S]*mousedown\([\s\S]*event\.preventDefault\(\)/,
  'inline icon must intercept the mousedown before the browser places a native caret, to avoid the native/PM flicker',
);
assert.match(
  source,
  /handleClick[\s\S]*nudgeToRightOfTrailingIcon/,
  'inline icon click path must funnel through the same trailing-icon caret fix',
);

console.log('Inline icon leading-caret verification: PASS');
