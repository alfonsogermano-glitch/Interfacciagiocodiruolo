import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
const css=read('src/styles/index.css');
// I keyframes dello standard devono restare definiti.
for(const kf of ['locationArrowPulse','cancelWiggle','trashShake','smilePop','quoteFillA','quoteFillB','plusPulse','editWrite','saveDiskInsert','eyeBlink','copyFrontSwap','copyBackSwap','copyMarkSwap','arrowUpPulse','arrowDownPulse','dotsLightVTop','dotsLightVCenter','dotsLightVBottom','dotsLightHLeft','dotsLightHCenter','dotsLightHRight','signPulse','sparkleTwinkle','chatSoleTramonta','chatMontagnaTramonta'])assert.ok(css.includes(`@keyframes ${kf}`),`missing @keyframes ${kf}`);
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
const families=[['lucide-plus','plusPulse'],['lucide-save','saveDiskInsert'],['lucide-x','cancelWiggle'],['lucide-eye','eyeBlink'],['lucide-eye-off','eyeBlink'],['lucide-pen','editWrite'],['lucide-pencil','editWrite'],['lucide-trash-2','trashShake'],['lucide-smile','smilePop'],['lucide-quote','quoteFillA'],['lucide-arrow-up','arrowUpPulse'],['lucide-chevron-up','arrowUpPulse'],['lucide-arrow-down','arrowDownPulse'],['lucide-chevron-down','arrowDownPulse'],['lucide-chevron-right','locationArrowPulse'],['lucide-arrow-right','locationArrowPulse'],['lucide-archive','locationArrowPulse'],['lucide-rotate-ccw','locationArrowPulse'],['lucide-undo-2','locationArrowPulse'],['lucide-ellipsis-vertical','dotsLightVTop'],['lucide-ellipsis','dotsLightHLeft'],['lucide-user-plus','signPulse'],['lucide-user-minus','signPulse'],['lucide-sparkles','sparkleTwinkle']];
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
// Icona "Inserisci immagine" della chat (IconeImmagine.tsx): il sole sbuca
// dal bordo sinistro e va a tramontare DIETRO la montagna - per questo la
// montagna deve essere dipinta DOPO il sole (ordine DOM = ordine di pittura)
// e il sole deve stare dentro il clip dell'interno del riquadro, sennò
// uscirebbe dai bordi della cornice.
const iconeImmagine=read('src/app/components/IconeImmagine.tsx');
assert.match(iconeImmagine,/<clipPath[\s\S]{0,200}?<rect x="4" y="4" width="16" height="16"/,'image icon must clip the sun to the interior of the frame');
assert.match(iconeImmagine,/className="chat-sole"/,'sun element must carry the chat-sole class');
assert.match(iconeImmagine,/<circle className="chat-sole" cx="6" cy="6" r="2"/,'sun must rest in the top-left corner of the frame');
assert.match(iconeImmagine,/className="chat-montagna"/,'mountain element must carry the chat-montagna class');
assert.ok(iconeImmagine.indexOf('chat-sole')<iconeImmagine.indexOf('chat-montagna'),'mountain must be painted after the sun (DOM order = paint order), otherwise it cannot occlude it');
assert.match(css,/\.chat-sole[\s\S]{0,300}?animation:\s*chatSoleTramonta 4\.5s linear/,'sun must animate with chatSoleTramonta 4.5s linear (constant speed = fluid, ease-in-out stutters at every keyframe)');
assert.match(css,/\.chat-montagna[\s\S]{0,300}?animation:\s*chatMontagnaTramonta 4\.5s linear/,'mountain must animate with chatMontagnaTramonta 4.5s linear');
assert.match(css,/button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover \.chat-sole/,'sun must animate on enabled button hover only');
assert.match(css,/@keyframes chatSoleTramonta \{\s*0% \{ transform: translate\(0, 0\)/,'sun keyframes must start at the resting position (no jump on hover)');
// Traiettoria "sole reale": dall'angolo alto sinistro all'angolo basso
// destro (x E y crescenti fino al tramonto), non un semplice scorrimento
// orizzontale. Verificato sul keyframe di fine corsa, prima del reset.
assert.match(css,/@keyframes chatSoleTramonta[\s\S]*?78% \{ transform: translate\(12px, 12px\)/,'sun must travel down-right (both axes growing) until it sets behind the mountain');
// Il salto di reset deve cadere FUORI dal clip dell'interno (translate x <= -4
// = cerchio interamente fuori dal riquadro), cosi' il rientro in orizzontale
// verso la posizione di riposo e' invisibile finche non sbuca dal bordo.
assert.match(css,/@keyframes chatSoleTramonta[\s\S]*?translate\(-6px, 0px\)/,'sun must reset outside the clipped frame before re-entering horizontally');
assert.match(css,/@keyframes chatSoleTramonta[\s\S]{0,900}?opacity: 0/,'sun must hide during the invisible jump back to the top-left corner');
assert.match(css,/@keyframes chatMontagnaTramonta[\s\S]*?var\(--dash-surface\)/,'mountain must go dark (background color) while the sun is behind it');
assert.match(css,/@keyframes chatMontagnaTramonta[\s\S]*?currentColor/,'mountain must be light (currentColor) while the sun is visible');
const panelChat=read('src/app/components/session/SessionChatPanel.tsx');
assert.match(panelChat,/<ImageSun className="h-4 w-4" \/>/,'chat composer must render the animated image icon');
// Tutti gli ALTRI pulsanti che inseriscono immagini devono usare la STESSA
// icona animata: nessuno deve piu' usare le immagini statiche di lucide
// (Image/ImagePlus) per aggiungere un'immagine.
const newsPage=read('src/app/news/NewsPage.tsx');
assert.match(newsPage,/<ImageSun className="h-3\.5 w-3\.5" \/>/,'news "Aggiungi immagine" must use the animated image icon');
assert.doesNotMatch(newsPage,/Image as ImageIcon|ImagePlus/,'news must not fall back to a static lucide image icon');
const coverEditor=read('src/app/campaigns/CampaignCoverEditor.tsx');
assert.match(coverEditor,/<ImageSun className="h-\[22px\] w-\[22px\]" \/>/,'cover CTA must use the animated image icon');
assert.doesNotMatch(coverEditor,/ImagePlus/,'cover CTA must not fall back to ImagePlus');
const noteCommands=read('src/app/components/session/shared/noteEditorCommands.ts');
assert.match(noteCommands,/icon: ImageSun/,'note "Immagine" command must use the animated image icon');
assert.doesNotMatch(noteCommands,/icon: Image[,; ]/,'note image command must not use the static lucide Image icon');
const dieConfig=read('src/app/components/session/dice/CustomDieConfigurator.tsx');
assert.match(dieConfig,/<ImageSun className="h-4 w-4" \/>/,'dice face "Carica immagine" must use the animated image icon');
assert.doesNotMatch(dieConfig,/ImagePlus/,'dice face upload must not fall back to ImagePlus');
// La faccia dadi e' un <label> con dentro l'input file (non un bottone):
// deve comunque animare al suo hover, con la clausola extra nel CSS.
assert.match(css,/label\.cursor-pointer:hover \.chat-sole/,'file-input label hover must animate the sun too');
// I disabled non devono animare (coperti da :not(:disabled) e
// :not([aria-disabled='true']) - le voci di menu EntityKebabMenu usano
// aria-disabled invece dell'attributo disabled).
assert.doesNotMatch(css,/button:disabled:hover \.lucide/,'disabled buttons must not animate icons');
assert.match(css,/button:not\(:disabled\):not\(\[aria-disabled='true'\]\):hover:not\(:has\(/,'buttons must also exclude aria-disabled (menu items pattern)');
assert.doesNotMatch(css,/button:not\(:disabled\):hover:not\(:has\(/,'stale selectors without aria-disabled guard');
// Regola anti-regresso storica: niente animazione pura su role=button senza
// il :has di protezione.
assert.doesNotMatch(css,/\[role='button'\]:not\(\[aria-disabled='true'\]\):hover \./,'bare role=button hover (no :has guard) must not animate icons');
// Pulsanti "Annulla": devono tutti portare l'icona X (famiglia lucide-x ->
// cancelWiggle), sennò l'hover non ha nulla da animare. Copre le etichette
// su riga propria e le varianti one-liner ">Annulla</button>"; il condiviso
// ConfirmDialog etichetta dinamicamente ({cancelLabel}) e' controllato a parte.
function walkTsx(dir,out=[]){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory())walkTsx(p,out);
    else if(e.name.endsWith('.tsx'))out.push(p);
  }
  return out;
}
const missingX=[];
for(const file of walkTsx('src')){
  const text=fs.readFileSync(file,'utf8');
  const spots=[];
  let match;
  const ownLine=/^[ \t]*Annulla[ \t]*$/gm;
  while((match=ownLine.exec(text)))spots.push(match.index+match[0].search(/Annulla/));
  const inline = />Annulla<\/button>/g;
  while((match=inline.exec(text)))spots.push(match.index+1);
  for(const spot of spots){
    const window=text.slice(Math.max(0,spot-700),spot);
    const open=Math.max(window.lastIndexOf('<button'),window.lastIndexOf('<HorrorButton'));
    if(open<0)continue;
    if(!window.slice(open).includes('<X '))missingX.push(`${file}@${spot}`);
  }
}
assert.deepEqual(missingX,[],`Annulla buttons missing the animated X icon: ${missingX.join(', ')}`);
const confirmDialog=read('src/app/components/shared/ConfirmDialog.tsx');
assert.match(confirmDialog,/<X className="h-4 w-4 shrink-0"[^>]*\/>\s*\r?\n\s*\{cancelLabel\}/,'ConfirmDialog cancel button must render the X icon before the label');
console.log('Universal icon animation verification passed.');
