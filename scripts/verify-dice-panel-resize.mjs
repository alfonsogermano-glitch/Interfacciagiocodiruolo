import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, css] = await Promise.all([
  readFile(new URL('../src/app/components/session/SessionRightSidebar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/sessionPanelResize.css', import.meta.url), 'utf8'),
]);

assert.match(source, /DICE_PANEL_STORAGE_KEY\s*=\s*'hollowgate\.dice\.panel-width'/, 'dice panel width must persist independently');
assert.match(source, /DICE_PANEL_DEFAULT_WIDTH\s*=\s*1024/, 'dice panel must keep the current desktop starting width');
assert.match(source, /DICE_PANEL_MIN_WIDTH\s*=\s*640/, 'dice panel must keep a usable desktop minimum width');
assert.match(source, /viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - DICE_PANEL_VIEWPORT_GAP/, 'dice panel maximum must stay between both side rails');
assert.match(source, /localStorage\.getItem\(DICE_PANEL_STORAGE_KEY\)/, 'saved dice panel width must be restored');
assert.match(source, /localStorage\.setItem\(DICE_PANEL_STORAGE_KEY/, 'dice panel width must persist locally');
assert.match(source, /data-dice-panel-resizer="true"/, 'dice panel must expose a left resize handle');
assert.match(source, /handleDicePanelResizePointerMove/, 'dice panel drag must have a pointer move handler');
assert.match(source, /resize\.startWidth \+ \(resize\.startX - event\.clientX\)/, 'dragging dice panel border left must enlarge the panel');
assert.match(source, /openPanel === 'dice'[\s\S]*?dicePanelWidth/, 'dice panel width must be selected when Dadi is active');
assert.match(source, /openPanel === 'dice'[\s\S]*?dicePanelResizeHandle/, 'dice resize handle must be selected when Dadi is active');
assert.match(css, /\[data-dice-panel-resizer='true'\][\s\S]*?display:\s*none/, 'dice resize handle must stay disabled on narrow mobile\/tablet layouts');

console.log('Dice panel resize verification: PASS');
