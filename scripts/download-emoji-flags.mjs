// Scarica le bandiere Twemoji (SVG) in public/emoji-flags/.
// Windows non ha glifi bandiera (Segoe UI Emoji mostra le sigle tipo "IT"):
// il picker e le bolle chat usano queste immagini con fallback testuale.
// Uso: npm run download:emoji-flags  (serve src/data/emojiData.ts già generato)
// Twemoji di jdecked, licenza CC-BY 4.0 (vedi ATTRIBUTIONS.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const TWEMOJI_VERSION = '17.0.3';
const BASE = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;
const OUT_DIR = 'public/emoji-flags';

const REGIONAL = /[\u{1F1E6}-\u{1F1FF}]/u;
const TAG = /[\u{E0020}-\u{E007F}]/u;

function toFileName(cps) {
  return cps.map((codePoint) => codePoint.codePointAt(0).toString(16)).join('-');
}

function flagFileName(char) {
  const cps = [...char];
  if (cps.length === 2 && cps.every((c) => REGIONAL.test(c))) return toFileName(cps);
  if (cps[0] === '\u{1F3F4}' && cps.length > 1 && cps.slice(1).every((c) => TAG.test(c))) {
    return toFileName(cps);
  }
  return null;
}

const data = readFileSync('src/data/emojiData.ts', 'utf8');
const chars = [...data.matchAll(/^\s*\['(.+?)', /gm)].map((match) => match[1]);
const flags = [...new Set(chars.map(flagFileName).filter(Boolean))];

mkdirSync(OUT_DIR, { recursive: true });
let downloaded = 0;
let skipped = 0;
const failed = [];

for (const file of flags) {
  const destination = `${OUT_DIR}/${file}.svg`;
  if (existsSync(destination)) {
    skipped += 1;
    continue;
  }
  const response = await fetch(`${BASE}/${file}.svg`);
  if (!response.ok) {
    failed.push(file);
    continue;
  }
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  downloaded += 1;
}

console.log(
  `bandiere: ${flags.length} totali, ${downloaded} scaricate, ${skipped} già presenti, ` +
  `${failed.length} mancanti${failed.length ? ' (' + failed.join(', ') + ')' : ''}`,
);
if (flags.length < 250) {
  console.error('elenco bandiere sospettosamente corto: rigenera src/data/emojiData.ts');
  process.exit(1);
}
