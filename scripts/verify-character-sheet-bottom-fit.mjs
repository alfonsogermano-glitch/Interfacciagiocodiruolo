import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [sessionCharactersPanel, sessionPanelResizeCss] = await Promise.all([
  readFile(new URL('../src/app/components/session/SessionCharactersPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/sessionPanelResize.css', import.meta.url), 'utf8'),
]);

assert.match(
  sessionCharactersPanel,
  /className="flex-1 overflow-y-auto p-5"/,
  'Schede detail pane must retain the legacy p-5 marker that the scoped resize CSS corrects',
);

const detailPaneCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) \{([^}]*)\}/,
)?.[1] ?? '';

assert.match(detailPaneCss, /overflow:\s*hidden/, 'Schede detail pane must keep the full entity card inside the viewport');
assert.match(detailPaneCss, /padding-bottom:\s*0/, 'Schede detail pane must not reserve empty space below the entity card');

const cardShellCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) > div:not\(\.fixed\) \{([^}]*)\}/,
)?.[1] ?? '';
assert.match(cardShellCss, /height:\s*100%/, 'Schede entity card must continue filling the available detail height');
assert.match(cardShellCss, /overflow:\s*hidden/, 'Schede entity card border must remain fixed while its content scrolls');
assert.match(cardShellCss, /border-bottom-left-radius:\s*0/, 'Schede entity card must have a square bottom-left corner');
assert.match(cardShellCss, /border-bottom-right-radius:\s*0/, 'Schede entity card must have a square bottom-right corner');

const cardContentCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) > div:not\(\.fixed\) > div:first-child \{([^}]*)\}/,
)?.[1] ?? '';
assert.match(cardContentCss, /overflow-y:\s*auto/, 'only the inner entity content must scroll vertically');

console.log('Character sheet bottom-fit verification: PASS');
