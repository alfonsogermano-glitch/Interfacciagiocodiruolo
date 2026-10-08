import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const data = await readFile(new URL('../src/data/emojiData.ts', import.meta.url), 'utf8');
const picker = await readFile(
  new URL('../src/app/components/session/EmojiPicker.tsx', import.meta.url),
  'utf8',
);
const flagUtil = await readFile(
  new URL('../src/app/components/session/EmojiFlag.tsx', import.meta.url),
  'utf8',
);
const panel = await readFile(
  new URL('../src/app/components/session/SessionChatPanel.tsx', import.meta.url),
  'utf8',
);
const generator = await readFile(new URL('../scripts/generate-emoji-data.mjs', import.meta.url), 'utf8');
const attributions = await readFile(new URL('../ATTRIBUTIONS.md', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Dataset generato: volumi, gruppi Unicode completi, nessuna skin tone.
const entryLines = data.split('\n').filter((line) => /^\s*\['/.test(line));
assert.ok(entryLines.length >= 1400, `attese almeno 1400 emoji, trovate ${entryLines.length}`);
for (const line of entryLines) {
  assert.match(line, /^\s*\['.+', '.+', ':[a-z0-9_]+:'\],$/, `riga emoji malformata: ${line}`);
}
const groupCount = (data.match(/^    name: '/gm) || []).length;
assert.equal(groupCount, 9, `attesi 9 gruppi Unicode, trovati ${groupCount}`);
for (const group of [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
]) {
  assert.ok(data.includes(`name: '${group}'`), `gruppo mancante: ${group}`);
}
assert.ok(data.includes("'🫩'"), 'emoji recente (Emoji 17+) mancante: verifica emoji-test.txt aggiornato');
assert.doesNotMatch(data, /[\u{1F3FB}-\u{1F3FF}]/u, 'varianti skin tone non devono entrare nel dataset');

// Nomi italiani (CLDR) con shortcode derivato dal nome inglese.
assert.ok(data.includes("'😀', 'faccina con un gran sorriso', ':grinning_face:'"), 'nome italiano grinning mancante');
assert.ok(data.includes("'❤️', 'cuore rosso', ':red_heart:'"), 'nome italiano cuore mancante');
assert.ok(data.includes("'🇮🇹', 'bandiera: Italia', ':flag_italy:'"), 'nome italiano bandiera mancante');
assert.match(data, /'faccina (con un gran sorriso|sorridente)/, 'copertura nomi italiana insufficiente');
const italianNames = entryLines.filter((line) => {
  const match = /^\s*\['.+?', '(.+?)', ':(.+):'\],$/.exec(line);
  if (!match) return false;
  const slug = match[1].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug !== match[2];
}).length;
assert.ok(italianNames >= 1800, `attesi almeno 1800 nomi italiani, trovati ${italianNames}`);

// Generatore: fonte CLDR pinnata e normalizzazione FE0F.
assert.match(generator, /release-\d+/, 'generatore senza versione CLDR pinnata');
assert.match(generator, /annotationsDerived\/it\.xml/, 'generatore senza annotationsDerived italiane');
assert.match(generator, /\\uFE0F/, 'generatore senza normalizzazione variation selector');

// Bandiere: asset Twemoji presenti e utilità di conversione.
const flagFiles = readdirSync(new URL('../public/emoji-flags', import.meta.url))
  .filter((file) => file.endsWith('.svg'));
assert.ok(flagFiles.length >= 250, `attese almeno 250 bandiere SVG, trovate ${flagFiles.length}`);
assert.ok(flagFiles.includes('1f1ee-1f1f9.svg'), 'SVG bandiera Italia mancante');
assert.ok(flagFiles.includes('1f3f4-e0067-e0062-e0065-e006e-e0067-e007f.svg'), 'SVG bandiera Inghilterra mancante');
assert.match(flagUtil, /export function flagImageName/, 'utilità flagImageName mancante');
assert.match(flagUtil, /FLAG_IN_TEXT/, 'regex bandiere nel testo mancante');
assert.match(flagUtil, /onError/, 'fallback testuale banda immagine mancante');
assert.match(attributions, /Twemoji/, 'attribuzione Twemoji mancante');

// Picker: tab, ricerca, sezione frequente, anteprima, persistenza, perf.
const tabCount = (picker.match(/\sid: '/g) || []).length;
assert.equal(tabCount, 9, `attese 9 tab emoji, trovate ${tabCount}`);
for (const label of ['Recenti', 'Faccie e persone', 'Bandiere']) {
  assert.ok(picker.includes(`label: '${label}'`), `tab mancante: ${label}`);
}
assert.match(picker, /placeholder="Cerca emoji"/, 'campo di ricerca assente');
assert.match(picker, /title: 'Usati di frequente'/, 'sezione usati di frequente assente');
assert.match(picker, /grid-cols-9/, 'griglia 9 colonne assente');
assert.match(picker, /hsc_emoji_frequent/, 'chiave localStorage frequente assente');
assert.match(picker, /localStorage\.setItem\(FREQUENT_KEY/, 'salvataggio usi assente');
assert.match(picker, /hovered\.shortcode/, 'anteprima shortcode assente');
assert.match(picker, /hovered\.name/, 'anteprima nome assente');
assert.match(picker, /memo\(/, 'sezioni non memorizzate: rischio input lento con 1900+ bottoni');
assert.match(picker, /IntersectionObserver/, 'sezioni non lazy: apertura picker lenta con 1900+ bottoni');
assert.match(picker, /EmojiFlag/, 'bandiere non renderizzate come immagini nel picker');
assert.match(picker, /Nessuna emoji trovata per/, 'stato vuoto ricerca assente');

// Wiring nella chat: bottone attivo, inserimento a cursore, chiusura esterna, bolle.
assert.match(panel, /import { EmojiPicker } from '\.\/EmojiPicker'/, 'import picker mancante');
assert.match(panel, /<EmojiPicker onPick={insertEmoji} \/>/, 'picker non renderizzato');
assert.match(panel, /<FlagText>\{item\.message\.content\}<\/FlagText>/, 'bolle chat senza rendering bandiere');
const buttonIndex = panel.indexOf('aria-label="Inserisci emoji"');
assert.ok(buttonIndex >= 0, 'bottone Emoji assente');
const buttonSlice = panel.slice(buttonIndex, buttonIndex + 400);
assert.match(buttonSlice, /aria-expanded=\{emojiOpen\}/, 'bottone Emoji senza aria-expanded');
assert.match(buttonSlice, /setEmojiOpen\(\(open\) => !open\)/, 'bottone Emoji non apre/chiude il picker');
assert.match(buttonSlice, /text-\[var\(--dash-accent\)\]/, 'bottone Emoji senza stato attivo evidenziato');
assert.match(panel, /ref=\{inputRef\}/, 'input senza ref');
assert.match(panel, /onFocus=\{\(\) => \{ inputTouchedRef\.current = true; \}\}/, 'tracking focus input assente');
assert.match(panel, /setSelectionRange\(caret, caret\)/, 'ripristino cursore dopo inserimento assente');
assert.match(panel, /emojiPanelRef\.current\?\./, 'chiusura click esterno sul pannello assente');
assert.match(panel, /emojiButtonRef\.current\?\./, 'chiusura click esterno sul bottone assente');
assert.match(panel, /if \(event\.key === 'Escape'\) setEmojiOpen\(false\)/, 'chiusura Escape assente');
assert.match(panel, /bottom-full right-0 z-50/, 'posizionamento pannello errato');

// Tooltip sulla riga di inserimento: "+" = file, icona immagine, emoji.
assert.match(panel, /import \{ Tooltip, TooltipContent, TooltipTrigger \} from '\.\.\/ui\/tooltip'/, 'import Tooltip mancante');
const tooltipTexts = ['Inserisci file', 'Inserisci immagine', 'Inserisci emoji'];
for (const text of tooltipTexts) {
  assert.ok(panel.includes(`<TooltipContent side="top">${text}</TooltipContent>`), `tooltip "${text}" assente`);
}

// Catena di verifica.
assert.ok(pkg.scripts['verify:emoji-picker'], 'script verify:emoji-picker mancante');
assert.ok(pkg.scripts['generate:emoji-data'], 'script generate:emoji-data mancante');
assert.ok(pkg.scripts['download:emoji-flags'], 'script download:emoji-flags mancante');
assert.match(pkg.scripts.check, /verify:emoji-picker/, 'verify:emoji-picker non inserito in check');

console.log('Emoji picker verification: PASS');
