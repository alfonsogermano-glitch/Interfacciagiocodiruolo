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
    builder.onLoad({ filter: /.*/, namespace: 'sw-stub' }, args => {
      if (args.path === 'entities') return { contents: `export async function loadChapters(){window.__SW.privateLoads+=1;return window.__SW.chapters} export async function loadScenes(){window.__SW.privateLoads+=1;return window.__SW.scenes}`, loader: 'js' };
      if (args.path === 'active-scene') return { contents: `export function buildActiveScenePublication(campaignId,scene,chapter){return {id:'pub:'+scene.id,campaignId,sceneId:scene.id,chapterId:chapter.id,title:scene.title,description:scene.description,chapterTitle:chapter.title,mapUrl:chapter.mapUrl,sceneImageUrl:scene.imageUrl,mapMetadata:chapter.mapMetadata,mapRegions:scene.mapRegions,contextMetadata:scene.contextMetadata,publishedAt:new Date().toISOString()}}`, loader: 'js' };
      return { contents: `import React from '${reactUrl}'; export function useActiveScene(){const [activeScene,setActiveScene]=React.useState(window.__SW.active);return {activeScene,channelReady:true,publish:async value=>{window.__SW.published.push(value);setActiveScene(value)}}}`, loader: 'js' };
    });
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: new URL(`/@id/${args.path}`, baseUrl).href, external: true }));
  } }],
});

const homeSource = readFileSync('src/app/campaigns/CampaignHome.tsx', 'utf8');
const appSource = readFileSync('src/app/App.tsx', 'utf8');
const publicationSource = readFileSync('src/services/campaign/activeScene.ts', 'utf8');
assert.match(homeSource, /return <SessionWorkspace/, 'Avvia sessione apre la workspace dedicata');
assert.ok(!homeSource.includes('ActiveScenePanel'), 'la home campagna non mostra piu la Scena attiva');
const settingsIndex = homeSource.indexOf('Impostazioni Campagna');
const managementIndex = homeSource.indexOf('Gestione campagna', settingsIndex);
assert.ok(settingsIndex >= 0 && managementIndex > settingsIndex, 'Gestione segue Impostazioni nel menu campagna');
assert.match(appSource, /sessionWorkspaceActive \? null : \(/, 'la workspace sostituisce la sidebar globale');
assert.ok(!/notes:\s*scene\.notes/.test(publicationSource), 'le note GM non entrano nello snapshot pubblico');

const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  const result = await browser.evaluate(async (source, reactDomUrl) => {
    const react = await import('/@id/react');
    const h = (react.default || react).createElement;
    const dom = await import(reactDomUrl);
    const { createRoot } = dom.default || dom;
    const campaignId = '41000000-0000-0000-0000-000000000004';
    const chapter = (id, title, active) => ({ id, campaignId, title, description: '', notes: '', kind: 'standard', isActive: active, nextChapterIds: [], mapUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"></svg>', mapMetadata: { imageUrl: null, gridVisible: false, gridColumns: 20, gridRows: 20 }, locationMetadata: {}, createdAt: id, updatedAt: new Date().toISOString() });
    const scene = (id, chapterId, title) => ({ id, campaignId, chapterId, title, description: title + ' pubblica', notes: 'SEGRETO ' + title, status: 'ready', imageUrl: null, sortOrder: 0, nextSceneIds: [], mapRegions: [{ id: 'area-'+id, label: title, color: '#22d3ee', geometry: { kind: 'rect', rect: { x: 10, y: 10, width: 30, height: 20 } } }], contextMetadata: { timeOfDay: '', period: '', condition: '' }, createdAt: id, updatedAt: new Date().toISOString() });
    const c1 = chapter('41000000-0000-0000-0000-000000000011', 'Manicomio di Arkham', true);
    const c2 = chapter('41000000-0000-0000-0000-000000000012', 'Dunwich segreta', false);
    const s1 = scene('41000000-0000-0000-0000-000000000021', c1.id, 'Ingresso');
    const s2 = scene('41000000-0000-0000-0000-000000000022', c2.id, 'Rituale futuro');
    window.__SW = { chapters: [c1,c2], scenes: [s1,s2], privateLoads: 0, published: [], active: { id:'active-1',campaignId,sceneId:s1.id,chapterId:c1.id,title:s1.title,description:s1.description,chapterTitle:c1.title,mapUrl:c1.mapUrl,sceneImageUrl:null,mapMetadata:c1.mapMetadata,mapRegions:s1.mapRegions,contextMetadata:s1.contextMetadata,publishedAt:new Date().toISOString() }, ended: 0 };
    const moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const { SessionWorkspace } = await import(moduleUrl); URL.revokeObjectURL(moduleUrl);
    const gmHost = document.createElement('div'); document.body.appendChild(gmHost);
    createRoot(gmHost).render(h(SessionWorkspace,{campaignId,campaignName:'Orrore ad Arkham',isOwner:true,onEndSession:async()=>{window.__SW.ended+=1}}));
    await new Promise(resolve=>setTimeout(resolve,300));
    const futureButton=[...gmHost.querySelectorAll('button')].find(button=>button.textContent.includes('Rituale futuro')); futureButton.click();
    await new Promise(resolve=>setTimeout(resolve,200));
    const gm={text:gmHost.textContent,rects:gmHost.querySelectorAll('svg rect').length,published:window.__SW.published.map(item=>item.title),loads:window.__SW.privateLoads};
    const loadsBeforePlayer=window.__SW.privateLoads;
    const playerHost=document.createElement('div');playerHost.style.cssText='width:100%;height:800px';document.body.appendChild(playerHost);window.__SW.playerHost=playerHost;
    createRoot(playerHost).render(h(SessionWorkspace,{campaignId,campaignName:'Orrore ad Arkham',isOwner:false,onEndSession:async()=>{}}));
    await new Promise(resolve=>setTimeout(resolve,250));
    return {gm,playerText:playerHost.textContent,playerRects:playerHost.querySelectorAll('svg rect').length,playerPrivateLoads:window.__SW.privateLoads-loadsBeforePlayer};
  }, source, reactDomUrl);

  await browser.cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await browser.evaluate(() => { window.__SW.playerHost.style.width = '390px'; window.__SW.playerHost.style.height = '844px'; });
  await sleep(120);
  const mobile = await browser.evaluate(() => {
    const workspace = window.__SW.playerHost.firstElementChild;
    const aside = workspace.querySelector('aside').getBoundingClientRect();
    const main = workspace.querySelector('main').getBoundingClientRect();
    return { workspaceWidth: workspace.scrollWidth, asideHeight: aside.height, mainHeight: main.height };
  });

  assert.match(result.gm.text, /Capitoli e Scene/);
  assert.match(result.gm.text, /Manicomio di Arkham/);
  assert.match(result.gm.text, /Dunwich segreta/);
  assert.match(result.gm.text, /Termina sessione/);
  assert.deepEqual(result.gm.published, ['Rituale futuro'], 'click GM pubblica la Scena pronta');
  assert.ok(result.gm.rects >= 1, 'mappa centrale con regione');
  assert.match(result.playerText, /Manicomio di Arkham/);
  assert.match(result.playerText, /Ingresso/);
  assert.doesNotMatch(result.playerText, /Dunwich segreta|Rituale futuro|SEGRETO/);
  assert.doesNotMatch(result.playerText, /Termina sessione/);
  assert.equal(result.playerPrivateLoads, 0, 'il giocatore non carica Capitoli e Scene private');
  assert.equal(result.playerRects, 1, 'il giocatore vede la regione pubblicata');
  assert.ok(mobile.workspaceWidth <= 390 && mobile.asideHeight >= 220 && mobile.mainHeight > 300, 'workspace mobile senza overflow e con albero/mappa accessibili');
  console.log('Session workspace browser: PASS (albero GM, ramo pubblico player, mappa centrale, pubblicazione, privacy e menu Gestione).');
} finally {
  await browser.close();
}
