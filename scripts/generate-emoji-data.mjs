// Rigenera src/data/emojiData.ts dal file Unicode ufficiale + nomi italiani CLDR.
// Download emoji-test: https://unicode.org/Public/emoji/latest/emoji-test.txt
// Uso: npm run generate:emoji-data  (con emoji-test.txt nella root del progetto)
//      oppure node scripts/generate-emoji-data.mjs <percorso/txt> <percorso/out.ts>
// I nomi italiani arrivano da CLDR (annotation type="tts", release pinnata);
// se CLDR non è raggiungibile si usa il nome inglese e il comando fallisce.
import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2] ?? 'emoji-test.txt';
const outputPath = process.argv[3] ?? 'src/data/emojiData.ts';

const CLDR_RELEASE = 'release-47';
const CLDR_ANNOTATIONS = [
  `https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_RELEASE}/common/annotations/it.xml`,
  `https://raw.githubusercontent.com/unicode-org/cldr/${CLDR_RELEASE}/common/annotationsDerived/it.xml`,
];

async function loadItalianNames() {
  const names = new Map();
  for (const url of CLDR_ANNOTATIONS) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CLDR ${url}: HTTP ${response.status}`);
    const xml = await response.text();
    const annotation = /<annotation cp="([^"]+)" type="tts">([^<]*)<\/annotation>/g;
    let match;
    while ((match = annotation.exec(xml))) {
      // Alcuni cp CLDR omettono il variation selector FE0F: registra entrambe
      // le varianti così il lookup funziona in ogni direzione.
      addName(names, match[1], match[2]);
      addName(names, match[1].replace(/\uFE0F/g, ''), match[2]);
    }
  }
  return names;
}

function addName(names, key, value) {
  if (!key || names.has(key)) return;
  names.set(key, decodeXml(value));
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function shortcodeFromName(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `:${slug}:`;
}

const SKIN_TONE = /[\u{1F3FB}-\u{1F3FF}]/u;
const ENTRY = /^([0-9A-F ]+?)\s*;\s*fully-qualified\s+#\s+(\S+)\s+E[\d.]+\s+(.+)$/;

const lines = readFileSync(inputPath, 'utf8').split(/\r?\n/);
const groups = new Map();
let group = '';

for (const line of lines) {
  if (line.startsWith('# group: ')) {
    group = line.slice('# group: '.length).trim();
    continue;
  }
  if (line.startsWith('#')) continue;
  const match = ENTRY.exec(line);
  if (!match) continue;
  if (group === 'Component') continue;
  const char = match[2];
  const name = match[3].trim();
  if (SKIN_TONE.test(char)) continue;
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push([char, name]);
}

const EXPECTED = [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
];

const missing = EXPECTED.filter((name) => !groups.has(name));
if (missing.length) {
  console.error('Gruppi mancanti: ' + missing.join(', '));
  process.exit(1);
}

const italian = await loadItalianNames();
let translated = 0;
let total = 0;

const chunks = EXPECTED.map((name) => {
  const emojis = groups.get(name);
  total += emojis.length;
  const body = emojis.map(([char, englishName]) => {
    const displayName = italian.get(char) ?? italian.get(char.replace(/\uFE0F/g, ''));
    if (displayName) translated += 1;
    const name2 = displayName ?? englishName;
    return `      ['${char}', '${name2.replace(/'/g, "\\'")}', '${shortcodeFromName(englishName)}'],`;
  }).join('\n');
  return `  {\n    name: '${name}',\n    emojis: [\n${body}\n    ],\n  },`;
});

const output = `// Generato da scripts/generate-emoji-data.mjs.
// Fonte: unicode.org/Public/emoji/latest/emoji-test.txt (fully-qualified,
// senza varianti skin tone) + nomi italiani CLDR (${CLDR_RELEASE},
// annotation type="tts"; fallback sul nome inglese).
// Tupla: [carattere, nome visualizzato, shortcode]. Non modificare a mano.

export interface EmojiItem {
  char: string;
  name: string;
  shortcode: string;
}

export interface EmojiGroup {
  name: string;
  emojis: EmojiItem[];
}

const RAW_GROUPS: { name: string; emojis: [string, string, string][] }[] = [
${chunks.join('\n')}
];

export const EMOJI_GROUPS: EmojiGroup[] = RAW_GROUPS.map((group) => ({
  name: group.name,
  emojis: group.emojis.map(([char, name, shortcode]) => ({ char, name, shortcode })),
}));
`;

writeFileSync(outputPath, output, 'utf8');
console.log(`scritto ${outputPath}: ${EXPECTED.length} gruppi, ${total} emoji, ${translated} nomi italiani (${CLDR_RELEASE})`);
