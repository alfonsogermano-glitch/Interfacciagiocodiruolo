import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url),
  'utf8',
);

assert.match(
  source,
  /label="Linea orizzontale"[\s\S]{0,300}<Minus className="h-4 w-4"/,
  'horizontal rule toolbar action must use the distinct Minus icon',
);
assert.doesNotMatch(
  source,
  /\bSeparatorHorizontal\b/,
  'the old SeparatorHorizontal icon must not remain in the Notes toolbar',
);

console.log('Note toolbar icon verification: PASS');
