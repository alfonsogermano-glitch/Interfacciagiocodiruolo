import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(
  new URL('../src/app/components/session/sessionPanelResize.css', import.meta.url),
  'utf8',
);

const tabletMobileBlock = css.match(/@media \(max-width:\s*1023px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

assert.match(
  tabletMobileBlock,
  /\[data-session-slide-over='true'\]\s*\{[\s\S]*?left:\s*100px/,
  'mobile/tablet slide-over must start after the 100px global left sidebar',
);
assert.match(
  tabletMobileBlock,
  /width:\s*calc\(100vw - 100px - 5rem\)\s*!important/,
  'mobile/tablet slide-over width must reserve both the global sidebar and the 5rem session rail',
);
assert.match(
  tabletMobileBlock,
  /max-width:\s*calc\(100vw - 100px - 5rem\)\s*!important/,
  'mobile/tablet slide-over max-width must reserve both side rails',
);
assert.doesNotMatch(
  tabletMobileBlock,
  /left:\s*0\s*;/,
  'mobile/tablet slide-over must not sit underneath the global left sidebar',
);

console.log('Mobile session panels verification: PASS');
