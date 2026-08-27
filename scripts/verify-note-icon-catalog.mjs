import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_ICON_COUNT,
  LUCIDE_VERSION,
  EXPECTED_CATEGORY_COUNTS,
  LEGACY_ICON_NAMES,
  ICON_CATALOG,
  generateIconData,
  validateManifest,
} from './extract-lucide-icons.mjs';
import {
  NOTE_ICON_RECENTS_MAX,
  NOTE_ICON_RECENTS_STORAGE_KEY,
  normalizeNoteIconSearch,
  readRecentIconNames,
  recordRecentIconName,
  searchNoteIcons,
} from '../src/app/components/session/shared/noteIconCatalogUtils.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

const entries = validateManifest(ICON_CATALOG);
assert.equal(entries.length, EXPECTED_ICON_COUNT);
assert.equal(EXPECTED_ICON_COUNT, 210);
assert.equal(ICON_CATALOG.length, 10);
assert.deepEqual(
  ICON_CATALOG.map((section) => [section.category, section.icons.length]),
  Object.entries(EXPECTED_CATEGORY_COUNTS),
);

const names = entries.map((icon) => icon.name);
assert.equal(new Set(names).size, 210);
for (const legacyName of LEGACY_ICON_NAMES) {
  assert.ok(names.includes(legacyName), `legacy icon missing: ${legacyName}`);
}

for (const icon of entries) {
  assert.ok(icon.label.trim(), `${icon.name}: empty Italian label`);
  assert.ok(Array.isArray(icon.aliases), `${icon.name}: aliases must be an array`);
}

// Search: Lucide name, Italian label, aliases, category, case and accents.
assert.ok(searchNoteIcons(entries, 'skull').some((icon) => icon.name === 'Skull'));
assert.ok(searchNoteIcons(entries, 'teschio').some((icon) => icon.name === 'Skull'));
assert.ok(searchNoteIcons(entries, 'morte').some((icon) => icon.name === 'Skull'));
assert.ok(searchNoteIcons(entries, 'TeScHiO').some((icon) => icon.name === 'Skull'));
assert.ok(searchNoteIcons(entries, 'spada').some((icon) => icon.name === 'Sword'));
assert.ok(searchNoteIcons(entries, 'arma').some((icon) => icon.name === 'Sword'));
assert.ok(searchNoteIcons(entries, 'sword').some((icon) => icon.name === 'Sword'));
assert.ok(searchNoteIcons(entries, 'viaggio').some((icon) => icon.name === 'Compass'));
assert.equal(normalizeNoteIconSearch(' ATTIVITÀ  '), 'attivita');
assert.ok(searchNoteIcons(entries, 'attivita').some((icon) => icon.name === 'Activity'));

// Recenti: max 12, no duplicates, re-selection returns to the head, stale names ignored.
const validNames = new Set(names);
const storage = createMemoryStorage();
for (const name of names.slice(0, NOTE_ICON_RECENTS_MAX + 2)) {
  recordRecentIconName(name, validNames, storage);
}
let recents = readRecentIconNames(validNames, storage);
assert.equal(recents.length, NOTE_ICON_RECENTS_MAX);
assert.equal(new Set(recents).size, recents.length);
const reselection = recents.at(-1);
recordRecentIconName(reselection, validNames, storage);
recents = readRecentIconNames(validNames, storage);
assert.equal(recents[0], reselection);
assert.equal(new Set(recents).size, recents.length);
storage.setItem(
  NOTE_ICON_RECENTS_STORAGE_KEY,
  JSON.stringify(['NotARealLucideIcon', names[0], names[0], names[1]]),
);
assert.deepEqual(readRecentIconNames(validNames, storage), [names[0], names[1]]);

// Versioned raw SVG generation: validates every public Lucide export/module and SVG node.
const generated = await generateIconData();
assert.equal(Object.keys(generated.iconData).length, 210);
assert.deepEqual(Object.keys(generated.iconData), names);
for (const [name, primitives] of Object.entries(generated.iconData)) {
  assert.ok(Array.isArray(primitives) && primitives.length > 0, `${name}: invalid SVG primitives`);
  for (const primitive of primitives) {
    assert.ok(Array.isArray(primitive) && primitive.length === 2, `${name}: malformed SVG primitive`);
    assert.equal(typeof primitive[0], 'string', `${name}: malformed SVG tag`);
    assert.equal(typeof primitive[1], 'object', `${name}: malformed SVG attrs`);
  }
}

const packageJson = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
assert.equal(packageJson.dependencies['lucide-react'], LUCIDE_VERSION);
assert.equal(LUCIDE_VERSION, '0.487.0');

const [gridSource, inlinePickerSource, titleSource, tiptapSource] = await Promise.all([
  readFile(resolve(ROOT, 'src/app/components/session/shared/NoteIconGrid.tsx'), 'utf8'),
  readFile(resolve(ROOT, 'src/app/components/session/shared/NoteContextualPickers.tsx'), 'utf8'),
  readFile(resolve(ROOT, 'src/app/components/session/shared/NoteListRow.tsx'), 'utf8'),
  readFile(resolve(ROOT, 'src/app/components/session/shared/tiptapInlineIcon.ts'), 'utf8'),
]);

// Inline and title pickers share NoteIconGrid; no hand-maintained Lucide component map remains.
assert.match(inlinePickerSource, /<NoteIconGrid/);
assert.match(titleSource, /<NoteIconGrid/);
assert.match(gridSource, /new Proxy\(/);
assert.doesNotMatch(gridSource, /Sword,\s*Swords,\s*Shield/);
assert.doesNotMatch(gridSource, /Record<string,\s*LucideIcon>/);

// Picker tooltips stay on the shared palette-aware Tooltip system.
assert.match(gridSource, /TooltipContent/);
assert.match(gridSource, /var\(--dash-/);
assert.doesNotMatch(gridSource, /#[0-9a-fA-F]{3,8}\b/);
assert.match(gridSource, /Cerca icona\.\.\./);
assert.match(gridSource, />\s*Recenti\s*</);
assert.match(gridSource, /Nessuna icona trovata\./);

// Saved TipTap format and unknown-name fallback remain unchanged/safe.
assert.match(tiptapSource, /ICON_DATA\[iconName\]\s*\?\?\s*ICON_DATA\[DEFAULT_ICON_NAME\]/);
assert.match(tiptapSource, /attrs:\s*\{\s*name\s*\}/);
for (const legacyName of LEGACY_ICON_NAMES) {
  assert.ok(generated.iconData[legacyName], `legacy TipTap icon not renderable: ${legacyName}`);
}

// Unknown title icon: compatibility adapter returns undefined and existing row renders conditionally.
assert.match(gridSource, /!ICON_DATA\[property\]\)\s*return undefined/);
assert.match(titleSource, /TitleIconComponent\s*&&\s*<TitleIconComponent/);

console.log(`Note icon catalog verification passed: ${names.length} icons, ${ICON_CATALOG.length} categories.`);
