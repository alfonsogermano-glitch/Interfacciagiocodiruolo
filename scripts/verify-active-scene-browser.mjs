import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { startNoteBrowser, sleep } from './note-browser-driver.mjs';

const baseUrl = process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187';
const reactUrl = new URL('/@id/react', baseUrl).href;
const reactDomUrl = new URL('/@id/react-dom', baseUrl).href;

const bundle = await build({
  entryPoints: ['src/app/components/session/SessionWorkspace.tsx'],
  bundle: true, format: 'esm', platform: 'browser', write: false,
  plugins: [{ name: 'session-workspace-browser', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'sw-react' }));
    builder.onLoad({ filter: /.*/, namespace: 'sw-react' }, () => ({
      contents: `import React from '${reactUrl}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`, loader: 'js',
    }));
    builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'sw-jsx' }));
    builder.onLoad({ filter: /.*/, namespace: 'sw-jsx' }, () => ({
      contents: `import React from '${reactUrl}'; export const Fragment=React.Fragment; export function jsx(type,props,key){const p=Object.assign({},props);if(key!==undefined&&p.key===undefined)p.key=key;return React.createElement(type,p)} export const jsxs=jsx; export const jsxDEV=jsx;`, loader: 'js',
    }));
    builder.onResolve({ filter: /entitiesService$/ }, () => ({ path: 'entities', namespace: 'sw-stub' }));
    builder.onResolve({ filter: /services\/campaign\/activeScene$/ }, () => ({ path: 'active-scene', namespace: 'sw-stub' }));
    builder.onResolve({ filter: /useActiveScene$/ }, () => ({ path: 'active-hook', namespace: 'sw-stub' }));
    builder.onResolve({ filter: /useCampaignDocument$/ }, () => ({ path: 'campaign-document-hook', namespace: 'sw-stub' }));
    builder.onResolve({ filter: /services\/campaign\/sceneEncounter$/ }, () => ({ path: 'scene-encounter', namespace: 'sw-stub' }));
    builder.onLoad({ filter: /.*/, namespace: 'sw-stub' }, args => {
      if (args.path === 'entities') return { contents: `export async function loadChapters(){window.__SW.privateLoads+=1;return window.__SW.chapters} export async function loadScenes(){window.__SW.privateLoads+=1;return window.__SW.scenes}`, loader: 'js' };
      if (args.path === 'active-scene') return { contents: `export function buildActiveScenePublication(campaignId,scene,chapter){return {id:'pub:'+scene.id,campaignId,sceneId:scene.id,chapterId:chapter.id,title:scene.title,description:scene.description,chapterTitle:chapter.title,mapUrl:chapter.mapUrl,sceneImageUrl:scene.imageUrl,mapMetadata:chapter.mapMetadata,mapRegions:scene.mapRegions,contextMetadata:scene.contextMetadata,publishedAt:new Date().toISOString()}}`, loader: 'js' };
      if (args.path === 'active-hook') return { contents: `import React from '${reactUrl}'; export function useActiveScene(){const [activeScene,setActiveScene]=React.useState(window.__SW.active);return {activeScene,channelReady:true,publish:async value=>{window.__SW.published.push(value);setActiveScene(value)}}}`, loader: 'js' };
      if (args.path === 'campaign-document-hook') return { contents: `import React from '${reactUrl}'; export function useCampaignDocument(key,fallback,options){const [value,setValue]=React.useState(fallback);const update=next=>setValue(current=>{const value=typeof next==='function'?next(current):next;window.__SW.encounterChanges.push(value?.status??'stopped');return value});return options?.enabled===false?[fallback,update]:[value,update]}`, loader: 'js' };
      return { contents: `export async function buildSceneEncounter(campaignId,scene){return {id:'encounter-1',campaignId,environmentId:scene.environmentId??scene.id,environmentName:scene.title,sceneId:scene.id,npcIds:[],monsterIds:[],clueIds:[],situationIds:[],startedAt:new Date().toISOString(),status:'running'}}`, loader: 'js' };
    });
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: new URL(`/@id/${args.path}`, baseUrl).href, external: true }));
  } }],
});

const homeSource = readFileSync('src/app/campaigns/CampaignHome.tsx', 'utf8');
const appSource = readFileSync('src/app/App.tsx', 'utf8');
const topBarSource = readFileSync('src/app/layout/TopBar.tsx', 'utf8');
const indexCssSource = readFileSync('src/styles/index.css', 'utf8');
const publicationSource = readFileSync('src/services/campaign/activeScene.ts', 'utf8');
const workspaceSource = readFileSync('src/app/components/session/SessionWorkspace.tsx', 'utf8');
const viewportSource = readFileSync('src/app/components/session/MapViewport.tsx', 'utf8');
const mapToolStoreSource = readFileSync('src/app/components/session/mapToolStore.ts', 'utf8');
const sidebarSource = readFileSync('src/app/components/session/SessionRightSidebar.tsx', 'utf8');
const encounterManagerSource = readFileSync('src/app/components/gm/SceneEncounterManager.tsx', 'utf8');
const sceneEncounterServiceSource = readFileSync('src/services/campaign/sceneEncounter.ts', 'utf8');
assert.match(homeSource, /return <SessionWorkspace/, 'Avvia sessione apre la workspace dedicata');
assert.match(homeSource, /deleteCampaignDocument\(activeCampaign\.id, 'active-encounter'\)/, 'una nuova sessione parte senza incontri ereditati');
assert.ok(!homeSource.includes('ActiveScenePanel'), 'la home campagna non mostra piu la Scena attiva');
const settingsIndex = homeSource.indexOf('Impostazioni Campagna');
const managementIndex = homeSource.indexOf('Gestione campagna', settingsIndex);
assert.ok(settingsIndex >= 0 && managementIndex > settingsIndex, 'Gestione segue Impostazioni nel menu campagna');
assert.match(appSource, /sessionWorkspaceActive \? null : \(/, 'la workspace sostituisce la sidebar globale');
assert.match(appSource, /sessionWorkspaceActive=\{view === 'campaign-home' && sessionWorkspaceActive\}/, 'App attiva gli strumenti mappa solo nella workspace');
for (const tool of ['Muovi', 'Seleziona', 'Griglia', 'Misura', 'Disegna', 'Puntina', 'Nebbia', 'Muri', 'Puntatore']) assert.match(topBarSource, new RegExp(`label: '${tool}'`), `toolbar sessione include ${tool}`);
for (const icon of ['MoveMapIcon', 'SelectMapIcon', 'GridMapIcon', 'MeasureMapIcon', 'WallsMapIcon', 'PointerMapIcon']) assert.match(topBarSource, new RegExp(`function ${icon}`), `icona toolbar multipart ${icon}`);
for (const animation of ['MoveVertical', 'MoveHorizontal', 'SelectTrack', 'GridCell', 'MeasureFill', 'Draw', 'Pin', 'Fog', 'WallBrick1', 'WallBrick10', 'Pointer']) assert.match(indexCssSource, new RegExp(`@keyframes mapTool${animation}`), `animazione toolbar ${animation}`);
assert.ok(!/notes:\s*scene\.notes/.test(publicationSource), 'le note GM non entrano nello snapshot pubblico');
assert.doesNotMatch(workspaceSource, /\bEye\b/, 'la Scena pubblicata non usa un indicatore occhio ambiguo');
assert.match(viewportSource, /onWheel=\{zoom\}/, 'il viewport usa la rotellina per lo zoom');
assert.match(viewportSource, /setPointerCapture/, 'il pan mantiene la cattura robusta del puntatore');
assert.match(viewportSource, /PAN_ENABLED_TOOLS[\s\S]*'move'[\s\S]*'grid'[\s\S]*'pin'[\s\S]*'pointer'/, 'Muovi, Griglia, Puntina e Puntatore consentono il trascinamento');
assert.match(viewportSource, /data-map-interactive/, 'gli oggetti interattivi futuri possono escludere il pan della mappa');
assert.match(viewportSource, /hollowgate\.map-view/, 'pan e zoom persistono localmente per ogni utente');
assert.match(viewportSource, /MIN_SCALE = 0\.3/, 'lo zoom out arriva al trenta percento del fit iniziale');
assert.match(topBarSource, /data-session-grid-panel/, 'la toolbar espone il pannello configurazione griglia');
for (const gridType of ['square', 'hex-flat', 'hex-pointy']) assert.match(topBarSource, new RegExp(`'${gridType}'`), `pannello griglia include ${gridType}`);
assert.match(viewportSource, /data-session-map-grid/, 'la griglia viene renderizzata su tutta la tavolozza');
assert.match(viewportSource, /Math\.abs\(row\)[\s\S]*hexWidth \/ 2[\s\S]*row \* radius \* 1\.5/, 'la griglia esagonale a punta sfalsa righe distanti 1,5 raggi');
assert.match(viewportSource, /column \* radius \* 1\.5[\s\S]*Math\.abs\(column\)[\s\S]*hexHeight \/ 2/, 'la griglia esagonale piatta sfalsa colonne distanti 1,5 raggi');
assert.match(mapToolStoreSource, /snap: false/, 'lo snap e predisposto nelle impostazioni condivise');
assert.match(mapToolStoreSource, /unit: 'Metri'/, 'Metri e l’unita predefinita della griglia');
assert.match(topBarSource, /min="2"/, 'la cella della griglia puo scendere fino a 2 px');
assert.match(topBarSource, /type="color"[\s\S]*Colore griglia/, 'il pannello permette di scegliere il colore della griglia');
assert.match(topBarSource, /data-session-grid-size-stepper[\s\S]*appearance-none[\s\S]*webkit-inner-spin-button/, 'la dimensione cella usa lo stepper segmentato senza frecce native');
assert.match(viewportSource, /settings\.color \?\? '#38bdf8'/, 'le griglie salvate senza colore mantengono il colore predefinito');
assert.match(workspaceSource, /session-map-grids/, 'le impostazioni griglia persistono per Capitolo');
assert.match(sidebarSource, /isOwner \? \[\.\.\.ICONS, \.\.\.GM_ICONS\] : ICONS/, 'la rail aggiunge strumenti solo per il GM');
assert.match(sidebarSource, /label: 'Incontri'/, 'la scheda Incontri resta disponibile al GM');
assert.doesNotMatch(encounterManagerSource, /Ripubblica scena|Nascondi scena attiva|Avvia encounter/, 'la scheda Incontri non duplica i controlli operativi');
assert.match(sceneEncounterServiceSource, /!entity\.sceneId && entity\.chapterId === scene\.chapterId/, 'gli incontri ereditano i contenuti generali del capitolo');

const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  const result = await browser.evaluate(async (source, reactDomUrl) => {
    const react = await import('/@id/react');
    const h = (react.default || react).createElement;
    const dom = await import(reactDomUrl);
    const { createRoot } = dom.default || dom;
    localStorage.clear();
    const campaignId = '41000000-0000-0000-0000-000000000004';
    const chapter = (id, title, active) => ({ id, campaignId, title, description: '', notes: '', kind: 'standard', isActive: active, nextChapterIds: [], mapUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>', mapMetadata: { imageUrl: null, gridVisible: false, gridColumns: 20, gridRows: 20 }, locationMetadata: {}, createdAt: id, updatedAt: new Date().toISOString() });
    const scene = (id, chapterId, title) => ({ id, campaignId, chapterId, title, description: title + ' pubblica', notes: 'SEGRETO ' + title, status: 'ready', imageUrl: null, sortOrder: 0, nextSceneIds: [], mapRegions: [{ id: 'area-'+id, label: title, color: '#22d3ee', geometry: { kind: 'rect', rect: { x: 10, y: 10, width: 30, height: 20 } } }], contextMetadata: { timeOfDay: '', period: '', condition: '' }, createdAt: id, updatedAt: new Date().toISOString() });
    const c1 = chapter('41000000-0000-0000-0000-000000000011', 'Manicomio di Arkham', true);
    const c2 = chapter('41000000-0000-0000-0000-000000000012', 'Dunwich segreta', false);
    const s1 = scene('41000000-0000-0000-0000-000000000021', c1.id, 'Ingresso');
    const s2 = scene('41000000-0000-0000-0000-000000000022', c2.id, 'Rituale futuro');
    window.__SW = { chapters: [c1,c2], scenes: [s1,s2], privateLoads: 0, published: [], encounterChanges: [], active: { id:'active-1',campaignId,sceneId:s1.id,chapterId:c1.id,title:s1.title,description:s1.description,chapterTitle:c1.title,mapUrl:c1.mapUrl,sceneImageUrl:null,mapMetadata:c1.mapMetadata,mapRegions:s1.mapRegions,contextMetadata:s1.contextMetadata,publishedAt:new Date().toISOString() }, ended: 0 };
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { SessionWorkspace } = await import(moduleUrl); URL.revokeObjectURL(moduleUrl);
    const gmHost = document.createElement('div'); document.body.appendChild(gmHost);
    createRoot(gmHost).render(h(SessionWorkspace,{campaignId,campaignName:'Orrore ad Arkham',campaignLogoUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',isOwner:true,onEndSession:async()=>{window.__SW.ended+=1}}));
    await new Promise(resolve=>setTimeout(resolve,300));
    const futureButton=[...gmHost.querySelectorAll('button')].find(button=>button.textContent.includes('Rituale futuro')); futureButton.click();
    await new Promise(resolve=>setTimeout(resolve,200));
    const startEncounter=gmHost.querySelector('[aria-label="Avvia incontro Rituale futuro"]');startEncounter.click();
    await new Promise(resolve=>setTimeout(resolve,100));
    const pauseEncounter=gmHost.querySelector('[aria-label="Metti in pausa incontro Rituale futuro"]');pauseEncounter.click();
    await new Promise(resolve=>setTimeout(resolve,50));
    const resumeEncounter=gmHost.querySelector('[aria-label="Riprendi incontro Rituale futuro"]');resumeEncounter.click();
    await new Promise(resolve=>setTimeout(resolve,50));
    const stopEncounter=gmHost.querySelector('[aria-label="Termina incontro Rituale futuro"]');stopEncounter.click();
    await new Promise(resolve=>setTimeout(resolve,50));
    const resizer=gmHost.querySelector('[aria-label="Ridimensiona albero Capitoli e Scene"]');
    const widthBefore=getComputedStyle(gmHost.firstElementChild).gridTemplateColumns;
    resizer.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,button:0,clientX:280,bubbles:true}));
    resizer.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,clientX:360,bubbles:true}));
    resizer.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,clientX:360,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,50));
    const viewport=gmHost.querySelector('[data-map-viewport]');
    const mapTransform=viewport.querySelector('[data-map-transform]');
    const mapPlacement=viewport.querySelector('[data-map-placement]');
    const initialTransform=mapTransform.style.transform;
    viewport.dispatchEvent(new WheelEvent('wheel',{deltaY:-180,clientX:300,clientY:200,bubbles:true,cancelable:true}));
    await new Promise(resolve=>setTimeout(resolve,50));
    const zoomTransform=mapTransform.style.transform;
    const initialPlacement=mapPlacement.style.transform;
    mapPlacement.dispatchEvent(new PointerEvent('pointerdown',{pointerId:9,button:0,clientX:300,clientY:200,bubbles:true}));
    viewport.dispatchEvent(new PointerEvent('pointermove',{pointerId:9,clientX:350,clientY:230,bubbles:true}));
    viewport.dispatchEvent(new PointerEvent('pointerup',{pointerId:9,clientX:350,clientY:230,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,50));
    const movedPlacement=mapPlacement.style.transform;
    gmHost.querySelector('[aria-label="Blocca mappa"]').click();
    await new Promise(resolve=>setTimeout(resolve,50));
    viewport.dispatchEvent(new PointerEvent('pointerdown',{pointerId:10,button:0,clientX:300,clientY:200,bubbles:true}));
    viewport.dispatchEvent(new PointerEvent('pointermove',{pointerId:10,clientX:330,clientY:220,bubbles:true}));
    viewport.dispatchEvent(new PointerEvent('pointerup',{pointerId:10,clientX:330,clientY:220,bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,50));
    const lockedViewTransform=mapTransform.style.transform;
    const gmText=gmHost.textContent;
    const gmLogo=!!gmHost.querySelector('img[alt=""]');
    gmHost.querySelector('[aria-label="Nascondi pannello Capitoli e Scene"]').click();
    await new Promise(resolve=>setTimeout(resolve,50));
    const panelHidden=!gmHost.querySelector('aside') && !!gmHost.querySelector('[aria-label="Mostra pannello Capitoli e Scene"]');
    const gm={text:gmText,rects:gmHost.querySelectorAll('svg rect').length,published:window.__SW.published.map(item=>item.title),encounterChanges:window.__SW.encounterChanges,loads:window.__SW.privateLoads,logo:gmLogo,widthBefore,widthAfter:getComputedStyle(gmHost.firstElementChild).gridTemplateColumns,initialTransform,zoomTransform,lockedViewTransform,initialPlacement,movedPlacement,panelHidden};
    const loadsBeforePlayer=window.__SW.privateLoads;
    const playerHost=document.createElement('div');playerHost.style.cssText='width:100%;height:800px';document.body.appendChild(playerHost);window.__SW.playerHost=playerHost;
    createRoot(playerHost).render(h(SessionWorkspace,{campaignId,campaignName:'Orrore ad Arkham',isOwner:false,onEndSession:async()=>{}}));
    await new Promise(resolve=>setTimeout(resolve,250));
    return {gm,playerText:playerHost.textContent,playerMapAlt:playerHost.querySelector('main img')?.alt??'',playerRects:playerHost.querySelectorAll('svg rect').length,playerPrivateLoads:window.__SW.privateLoads-loadsBeforePlayer,playerDefaultLogo:!!playerHost.querySelector('img[src="/icon-source-1024.png"]'),playerHasTree:!!playerHost.querySelector('aside')};
  }, source, reactDomUrl);

  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.evaluate(() => { window.__SW.playerHost.style.width = '390px'; window.__SW.playerHost.style.height = '844px'; });
  await sleep(120);
  const mobile = await browser.evaluate(() => {
    const workspace = window.__SW.playerHost.firstElementChild;
    const main = workspace.querySelector('main').getBoundingClientRect();
    return { workspaceWidth: workspace.scrollWidth, hasAside: !!workspace.querySelector('aside'), mainHeight: main.height };
  });

  assert.match(result.gm.text, /Capitoli e Scene/);
  assert.match(result.gm.text, /Manicomio di Arkham/);
  assert.match(result.gm.text, /Dunwich segreta/);
  assert.match(result.gm.text, /Termina sessione/);
  assert.equal(result.gm.logo, true, 'portrait campagna visibile nella testata');
  assert.notEqual(result.gm.widthAfter, result.gm.widthBefore, 'divisore desktop ridimensiona albero e area mappa');
  assert.notEqual(result.gm.zoomTransform, result.gm.initialTransform, 'la rotellina modifica lo zoom della mappa');
  assert.notEqual(result.gm.movedPlacement, result.gm.initialPlacement, 'Muovi posiziona la mappa quando e sbloccata');
  assert.notEqual(result.gm.lockedViewTransform, result.gm.zoomTransform, 'Muovi sposta la vista quando la mappa e bloccata');
  assert.equal(result.gm.panelHidden, true, 'il GM puo richiudere il pannello Capitoli e Scene');
  assert.equal(result.gm.published[0], 'Manicomio di Arkham', 'la sessione pubblica inizialmente il Capitolo attivo');
  assert.ok(result.gm.published.includes('Rituale futuro'), 'il GM puo pubblicare successivamente una Scena');
  assert.deepEqual(result.gm.encounterChanges.slice(0, 4), ['running', 'paused', 'running', 'stopped'], 'Pausa mantiene la propria icona e alterna sospensione/ripresa');
  assert.ok(result.gm.rects >= 1, 'mappa centrale con regione');
  assert.match(result.playerMapAlt, /Manicomio di Arkham/, 'il giocatore riceve la mappa del Capitolo attivo');
  assert.doesNotMatch(result.playerText, /Ingresso/, 'all’avvio il giocatore vede il Capitolo senza una Scena selezionata');
  assert.doesNotMatch(result.playerText, /Dunwich segreta|Rituale futuro|SEGRETO/);
  assert.doesNotMatch(result.playerText, /Termina sessione/);
  assert.equal(result.playerPrivateLoads, 0, 'il giocatore non carica Capitoli e Scene private');
  assert.equal(result.playerRects, 0, 'senza Scena selezionata il giocatore non vede regioni di Scene precedenti');
  assert.equal(result.playerDefaultLogo, false, 'il giocatore non riceve la testata privata del pannello GM');
  assert.equal(result.playerHasTree, false, 'il pannello Capitoli e Scene e esclusivo del GM');
  assert.ok(mobile.workspaceWidth <= 390 && !mobile.hasAside && mobile.mainHeight > 700, 'workspace giocatore mobile dedicata interamente alla mappa');
  console.log('Session workspace browser: PASS (albero GM, ramo pubblico player, mappa centrale, pubblicazione, privacy e menu Gestione).');
} finally {
  await browser.close();
}
