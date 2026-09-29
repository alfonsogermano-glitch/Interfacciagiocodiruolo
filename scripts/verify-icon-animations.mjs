import assert from 'node:assert/strict';
import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
const css=read('src/styles/index.css');
// I keyframes dello standard devono restare definiti.
for(const kf of ['locationArrowPulse','cancelWiggle','trashShake','plusPulse','editWrite','saveDiskInsert','eyeBlink','copyFrontSwap','copyBackSwap','copyMarkSwap','arrowUpPulse','arrowDownPulse','dotsLightVTop','dotsLightVCenter','dotsLightVBottom','dotsLightHLeft','dotsLightHCenter','dotsLightHRight','signPulse','sparkleTwinkle'])assert.ok(css.includes(`@keyframes ${kf}`),`missing @keyframes ${kf}`);
// Regola universale: hover su bottone/voci menu (mai disabilitati) anima
// l'icona con lo stesso keyframe degli usi pionieristici.
assert.match(css,/button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover:not\(:has\(\[role='button'\] \.lucide-plus\)\) \.lucide-plus/,'universal rule must animate lucide-plus on enabled button hover (proximity formula)');
assert.match(css,/button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover:not\(:has\(\[role='button'\] \.lucide-trash-2\)\) \.lucide-trash-2/,'universal rule must animate lucide-trash-2 (proximity formula)');
assert.match(css,/\[role='menuitem'\]:not\(\[data-disabled\]\):hover \.lucide-plus/,'universal rule must cover menu items');
// Formula "interattivo piu' prossimo": il :has verso i contenitori remoti
// e' OBBLIGATORIO (bug card "Campagne recenti" = <button> con dentro
// div[role=button] del codice; card CampaignsPage = role=button con button).
assert.match(css,/:has\(\[role='button'\]/,'buttons must exclude icons nested in remote role=button containers');
assert.match(css,/:has\(button /,'role=button containers must exclude icons nested in real buttons');
const families=[['lucide-plus','plusPulse'],['lucide-save','saveDiskInsert'],['lucide-x','cancelWiggle'],['lucide-eye','eyeBlink'],['lucide-eye-off','eyeBlink'],['lucide-pen','editWrite'],['lucide-pencil','editWrite'],['lucide-trash-2','trashShake'],['lucide-arrow-up','arrowUpPulse'],['lucide-chevron-up','arrowUpPulse'],['lucide-arrow-down','arrowDownPulse'],['lucide-chevron-down','arrowDownPulse'],['lucide-chevron-right','locationArrowPulse'],['lucide-arrow-right','locationArrowPulse'],['lucide-archive','locationArrowPulse'],['lucide-rotate-ccw','locationArrowPulse'],['lucide-ellipsis-vertical','dotsLightVTop'],['lucide-ellipsis','dotsLightHLeft'],['lucide-user-plus','signPulse'],['lucide-user-minus','signPulse'],['lucide-sparkles','sparkleTwinkle']];
for(const [icon,anim] of families){
  assert.match(css,new RegExp(`${icon.replace('-','\\-')}[\\s\\S]{0,3000}?animation(?:-name)?:\\s*${anim}`),`family ${icon} must animate with ${anim}`);
}
// Copia/Duplica: alternanza chiaro<->scuro, nessuna maschera pixelosa.
// Ordine DOM custom in IconeCopia.tsx: dietro (path) PRIMO/sotto, davanti
// (rect) DOPO/sopra, + (line) ultime/sopra tutto. Il davanti alterna
// currentColor <-> var(--dash-panel, #0a0a0a) opaco, il dietro fill-opacity sfasato,
// il + inverte stroke in fase col davanti. Ciclo2.4s.
assert.ok(!css.includes('copyPop') && !css.includes('copySplit') && !css.includes('copyFillFront') && !css.includes('copyFillBack'),'old copy keyframes must be gone');
assert.ok(!css.includes('mask-image') && !css.includes('clip-path'),'copy must not rely on pixelated mask/clip hacks');
assert.match(css,/\.lucide-copy[\s\S]{0,3000}?> rect[\s\S]{0,300}?animation:\s*copyFrontSwap 2\.4s/,'front square must swap with copyFrontSwap 2.4s');
assert.match(css,/\.lucide-copy[\s\S]{0,3000}?> path[\s\S]{0,300}?animation:\s*copyBackSwap 2\.4s/,'back square must fill with copyBackSwap 2.4s');
assert.match(css,/\.lucide-copy-plus[\s\S]{0,3000}?> line[\s\S]{0,300}?animation:\s*copyMarkSwap 2\.4s/,'copy-plus mark must swap with copyMarkSwap 2.4s');
assert.match(css,/@keyframes copyFrontSwap[\s\S]*?var\(--dash-panel, #0a0a0a\)/,'front must go dark (theme bg) while the back lights up');
assert.match(css,/@keyframes copyMarkSwap[\s\S]*?stroke: var\(--dash-panel, #0a0a0a\)/,'plus mark must invert dark while the front is filled');
// Il path del dietro e' aperto (forma a L): durante il riempimento deve
// chiudersi in un rettangolo completo (d: path(...) con Z).
assert.match(css,/@keyframes copyBackSwap[\s\S]*?d: path\(/,'back square must close into a full rectangle (d:path) during the fill');
// IconeCopia.tsx: dietro PRIMO, davanti DOPO, + ultime (ordine DOM =
// ordine di pittura SVG). Se un giorno tornasse l'ordine lucide (rect
// prima di path) il dietro si sovrporrebbe di nuovo al davanti.
const iconeCopia=read('src/app/components/IconeCopia.tsx');
assert.match(iconeCopia,/\['path', \{ d: 'M4 16[\s\S]{0,200}?\['rect'/,'copy must paint the back path before the front rect');
assert.match(iconeCopia,/createLucideIcon\('copy-plus'[\s\S]*?\['rect'[\s\S]*?\['line'[\s\S]*?\['line'/,'copy-plus mark lines must paint last (above both squares)');
assert.doesNotMatch(iconeCopia,/\['rect', \{[^}]*\}\],\s*\['path'/,'lucide default order (rect before path) must not come back');
// I disabled non devono animare (coperti da :not(:disabled) e
// :not([aria-disabled='true']) - le voci di menu EntityKebabMenu usano
// aria-disabled invece dell'attributo disabled).
assert.doesNotMatch(css,/button:disabled:hover \.lucide/,'disabled buttons must not animate icons');
assert.match(css,/button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover:not\(:has\(/,'buttons must also exclude aria-disabled (menu items pattern)');
assert.doesNotMatch(css,/button:not\(:disabled\):hover:not\(:has\(/,'stale selectors without aria-disabled guard');
// Regola anti-regresso storica: niente animazione pura su role=button senza
// il :has di protezione.
assert.doesNotMatch(css,/\[role='button'\]:not\(\[aria-disabled='true'\]\):hover \./,'bare role=button hover (no :has guard) must not animate icons');
console.log('Universal icon animation verification passed.');
