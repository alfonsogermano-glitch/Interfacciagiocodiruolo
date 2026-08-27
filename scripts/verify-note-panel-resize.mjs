import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../src/app/components/session/SessionNotesPanel.tsx', import.meta.url),
  'utf8',
);
const [sessionRightSidebar, slideOverPanel, sessionCharactersPanel, sessionPanelResizeCss] = await Promise.all([
  readFile(new URL('../src/app/components/session/SessionRightSidebar.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/SlideOverPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/SessionCharactersPanel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/components/session/sessionPanelResize.css', import.meta.url), 'utf8'),
]);

assert.match(source, /NOTES_SIDEBAR_DEFAULT_WIDTH\s*=\s*256/, 'default note sidebar width must remain 256px');
assert.match(source, /NOTES_SIDEBAR_MIN_WIDTH\s*=\s*192/, 'note sidebar must have a usable minimum width');
assert.match(source, /NOTES_DETAIL_MIN_WIDTH\s*=\s*360/, 'note detail must retain meaningful minimum room');
assert.match(source, /containerWidth - NOTES_DETAIL_MIN_WIDTH/, 'maximum sidebar width must depend on available panel width');
assert.match(source, /localStorage\.getItem\(NOTES_SIDEBAR_STORAGE_KEY\)/, 'saved sidebar width must be restored');
assert.match(source, /localStorage\.setItem\(NOTES_SIDEBAR_STORAGE_KEY/, 'sidebar width must persist locally');
assert.match(source, /new ResizeObserver\(/, 'sidebar width must re-clamp when the panel resizes');
assert.match(source, /setPointerCapture\(event\.pointerId\)/, 'dragging must use pointer capture');
assert.match(source, /releasePointerCapture\(event\.pointerId\)/, 'pointer capture must be released');
assert.match(source, /data-note-sidebar-resizer="true"/, 'divider must expose a dedicated resize hit target');
assert.match(source, /touchAction:\s*'none'/, 'splitter must suppress browser touch gestures while dragging');
assert.match(source, /style=\{\{\s*width:\s*sidebarWidth\s*\}\}/, 'sidebar width must be driven by state');
assert.doesNotMatch(source, /className="w-64 shrink-0 overflow-y-auto/, 'fixed w-64 sidebar must not return');
assert.match(source, /className="min-w-0 flex-1 overflow-auto p-4"/, 'detail pane must be allowed to shrink correctly');

assert.match(sessionRightSidebar, /NOTES_PANEL_STORAGE_KEY\s*=\s*'hollowgate\.notes\.panel-width'/, 'outer notes panel width must have its own storage key');
assert.match(sessionRightSidebar, /NOTES_PANEL_DEFAULT_WIDTH\s*=\s*1024/, 'outer notes panel must start at the old 5xl width');
assert.match(sessionRightSidebar, /NOTES_PANEL_MIN_WIDTH\s*=\s*640/, 'outer notes panel must keep a usable minimum width');
assert.match(sessionRightSidebar, /LEFT_SIDEBAR_WIDTH\s*=\s*100/, 'outer notes resize must reserve the 100px global left sidebar');
assert.match(sessionRightSidebar, /viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP/, 'outer notes maximum must reserve left sidebar, right rail, and safety gap');
assert.match(sessionRightSidebar, /Math\.max\(\s*0,\s*viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP,?\s*\)/, 'narrow viewports must not restore an overlap-producing minimum maximum width');
assert.doesNotMatch(sessionRightSidebar, /Math\.max\(320,\s*viewportWidth - SESSION_RAIL_WIDTH - NOTES_PANEL_VIEWPORT_GAP\)/, 'old viewport-only maximum must not return');
assert.match(sessionRightSidebar, /localStorage\.getItem\(NOTES_PANEL_STORAGE_KEY\)/, 'outer notes width must be restored locally');
assert.match(sessionRightSidebar, /return clampNotesPanelWidth\(candidate, window\.innerWidth\)/, 'restored outer width must be clamped against the current viewport');
assert.match(sessionRightSidebar, /localStorage\.setItem\(NOTES_PANEL_STORAGE_KEY/, 'outer notes width must persist locally');
assert.match(sessionRightSidebar, /setNotesPanelWidth\(\(currentWidth\) => clampNotesPanelWidth\(currentWidth, window\.innerWidth\)\)/, 'viewport resize must recover an oversized notes panel automatically');
assert.match(sessionRightSidebar, /data-note-panel-resizer="true"/, 'notes panel must expose a dedicated outer resize handle');

assert.match(sessionRightSidebar, /CHARACTERS_PANEL_STORAGE_KEY\s*=\s*'hollowgate\.characters\.panel-width'/, 'Schede outer width must have its own storage key');
assert.match(sessionRightSidebar, /CHARACTERS_PANEL_DEFAULT_WIDTH\s*=\s*1024/, 'Schede outer panel must preserve the old 5xl starting width');
assert.match(sessionRightSidebar, /CHARACTERS_PANEL_MIN_WIDTH\s*=\s*640/, 'Schede outer panel must keep a usable minimum width');
assert.match(sessionRightSidebar, /viewportWidth - LEFT_SIDEBAR_WIDTH - SESSION_RAIL_WIDTH - CHARACTERS_PANEL_VIEWPORT_GAP/, 'Schede outer maximum must reserve left sidebar, right rail, and safety gap');
assert.match(sessionRightSidebar, /localStorage\.getItem\(CHARACTERS_PANEL_STORAGE_KEY\)/, 'Schede outer width must be restored locally');
assert.match(sessionRightSidebar, /localStorage\.setItem\(CHARACTERS_PANEL_STORAGE_KEY/, 'Schede outer width must persist locally');
assert.match(sessionRightSidebar, /setCharactersPanelWidth\(\(currentWidth\) => clampCharactersPanelWidth\(currentWidth, window\.innerWidth\)\)/, 'viewport resize must recover an oversized Schede panel automatically');
assert.match(sessionRightSidebar, /data-character-panel-resizer="true"/, 'Schede panel must expose a dedicated outer resize handle');
assert.match(sessionRightSidebar, /handleCharactersPanelResizePointerMove/, 'Schede outer drag must have a pointer move handler');
assert.match(sessionRightSidebar, /resize\.startWidth \+ \(resize\.startX - event\.clientX\)/, 'dragging Schede outer border left must enlarge the panel');

assert.match(sessionRightSidebar, /CHARACTERS_SIDEBAR_STORAGE_KEY\s*=\s*'hollowgate\.characters\.sidebar-width'/, 'Schede list width must persist independently');
assert.match(sessionRightSidebar, /CHARACTERS_SIDEBAR_DEFAULT_WIDTH\s*=\s*256/, 'Schede list must preserve the current 256px starting width');
assert.match(sessionRightSidebar, /CHARACTERS_SIDEBAR_MIN_WIDTH\s*=\s*192/, 'Schede list must keep a usable minimum width');
assert.match(sessionRightSidebar, /CHARACTERS_DETAIL_MIN_WIDTH\s*=\s*360/, 'Schede detail must retain meaningful minimum room');
assert.match(sessionRightSidebar, /panelWidth - CHARACTERS_DETAIL_MIN_WIDTH/, 'Schede list maximum must depend on available panel width');
assert.match(sessionRightSidebar, /localStorage\.getItem\(CHARACTERS_SIDEBAR_STORAGE_KEY\)/, 'Schede list width must be restored locally');
assert.match(sessionRightSidebar, /localStorage\.setItem\(CHARACTERS_SIDEBAR_STORAGE_KEY/, 'Schede list width must persist locally');
assert.match(sessionRightSidebar, /setCharactersSidebarWidth\(\(currentWidth\) => clampCharactersSidebarWidth\(currentWidth, charactersPanelWidth\)\)/, 'Schede list must re-clamp when the outer panel changes width');
assert.match(sessionRightSidebar, /data-character-sidebar-resizer="true"/, 'Schede list must expose its own internal resize handle');
assert.match(sessionRightSidebar, /resize\.startWidth \+ \(event\.clientX - resize\.startX\)/, 'dragging Schede internal divider right must enlarge the list');
assert.match(sessionRightSidebar, /data-session-characters-resizable="true"/, 'Schede must render inside a dedicated resizable shell');
assert.match(sessionRightSidebar, /--characters-list-width/, 'Schede shell must receive the dynamic list width CSS variable');
assert.match(sessionRightSidebar, /resizablePanelOpen = openPanel === 'notes' \|\| openPanel === 'characters'/, 'both Notes and Schede must bypass the shared max-width only while active');
assert.match(sessionRightSidebar, /openPanel === 'characters' \? charactersPanelWidth/, 'Schede outer width must be selected independently from Notes');
assert.match(sessionRightSidebar, /openPanel === 'characters' \? charactersPanelResizeHandle/, 'Schede outer resize handle must be selected independently from Notes');

assert.match(sessionCharactersPanel, /className="w-64 shrink-0 overflow-y-auto/, 'legacy Schede list marker must remain identifiable for the scoped CSS override');
assert.match(sessionPanelResizeCss, /\[data-session-characters-resizable='true'\] > div:first-child > div:first-child/, 'scoped CSS must target only the Schede list column');
assert.match(sessionPanelResizeCss, /width:\s*var\(--characters-list-width\)\s*!important/, 'Schede list width must follow the dynamic CSS variable');

const charactersDetailPaneCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) \{([^}]*)\}/,
)?.[1] ?? '';
assert.match(charactersDetailPaneCss, /min-height:\s*0/, 'Schede detail pane must be allowed to shrink vertically');
assert.match(charactersDetailPaneCss, /max-height:\s*100%/, 'Schede detail pane must stay within the panel height');
assert.match(charactersDetailPaneCss, /overflow:\s*hidden/, 'Schede detail pane must keep the full card border inside the viewport');
assert.doesNotMatch(charactersDetailPaneCss, /overflow-y:\s*auto/, 'outer Schede detail pane must not scroll the whole entity card');

const charactersCardShellCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) > div:not\(\.fixed\) \{([^}]*)\}/,
)?.[1] ?? '';
assert.match(charactersCardShellCss, /height:\s*100%/, 'Schede entity card shell must fill the visible panel height');
assert.match(charactersCardShellCss, /min-height:\s*0/, 'Schede entity card shell must be allowed to shrink');
assert.match(charactersCardShellCss, /max-height:\s*100%/, 'Schede entity card shell must not extend below the panel');
assert.match(charactersCardShellCss, /overflow:\s*hidden/, 'Schede entity card shell must preserve its visible bottom border');

const charactersCardContentCss = sessionPanelResizeCss.match(
  /\[data-session-characters-resizable='true'\] > div:first-child > div:nth-child\(2\) > div:not\(\.fixed\) > div:first-child \{([^}]*)\}/,
)?.[1] ?? '';
assert.match(charactersCardContentCss, /height:\s*100%/, 'Schede entity content must inherit the visible card height');
assert.match(charactersCardContentCss, /min-height:\s*0/, 'Schede entity content must be allowed to shrink');
assert.match(charactersCardContentCss, /overflow-y:\s*auto/, 'only the inner Schede entity content must scroll vertically');
assert.match(charactersCardContentCss, /overscroll-behavior:\s*contain/, 'Schede entity scrolling must stay inside the card');

assert.match(slideOverPanel, /panelWidth\?: number;/, 'SlideOverPanel must accept an optional explicit width');
assert.match(slideOverPanel, /leftResizeHandle\?: React\.ReactNode;/, 'SlideOverPanel must accept an optional left resize handle');
assert.match(slideOverPanel, /width: panelWidth/, 'SlideOverPanel must apply the optional explicit width');
assert.match(slideOverPanel, /\{leftResizeHandle\}/, 'SlideOverPanel must render the optional left resize handle');
assert.match(slideOverPanel, /fixed top-12 bottom-0 z-\[900\] flex min-h-0 flex-col/, 'SlideOverPanel must allow its fixed top/bottom bounds to constrain flex content');
assert.match(slideOverPanel, /className="min-h-0 flex-1 overflow-hidden"/, 'SlideOverPanel content slot must allow internal scrolling without growing below the viewport');
assert.match(slideOverPanel, /widthClassName = 'w-full max-w-5xl'/, 'default shared panel width contract must remain available for non-resizable panels');
assert.match(sessionRightSidebar, /setPointerCapture\(event\.pointerId\)/, 'all resize gestures must use pointer capture');
assert.match(sessionRightSidebar, /releasePointerCapture\(event\.pointerId\)/, 'all resize gestures must release pointer capture');

console.log('Session panel resize verification: PASS');
