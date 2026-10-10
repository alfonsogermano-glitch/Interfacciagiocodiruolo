import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { startNoteBrowser, sleep } from './note-browser-driver.mjs';

// Verifica UI reale in Chromium con trasporto isolato. Le policy SQL sono
// verificate separatamente da verify-private-chat.mjs su PostgreSQL embedded.
const modules = {
  AuthContext: `export function useAuth() { return { user: window.__PC.user }; }`,
  CampaignContext: `export function useCampaign() { return { activeCampaign: window.__PC.campaign }; }`,
  campaignChannel: `import {useEffect,useRef} from 'react';
    export function useCampaignChannel(id, options = {}) {
      const ref=useRef(options); ref.current=options;
      useEffect(()=>{const listener=()=>ref.current.onPresenceSync?.(window.__PC.presence);window.__PC.presenceListeners.add(listener);listener();return()=>window.__PC.presenceListeners.delete(listener)},[id]);
      return {isReady:true};
    }`,
  SessionChatPanel: `import {createElement} from 'react'; export function SessionChatPanel(){return createElement('div',{'data-public-chat-test':true},'Chat pubblica della campagna')}`,
  supabaseClient: `export const supabase = window.__PC.client;`,
};
const bundle = await build({
  entryPoints: ['src/app/components/session/CampaignChatPanel.tsx'], bundle: true, format: 'esm', platform: 'browser', write: false,
  jsx: 'transform', jsxFactory: '__TestReact.createElement', jsxFragment: '__TestReact.Fragment',
  banner: { js: `import __TestReact from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}';` },
  plugins: [{ name: 'private-chat-isolated-browser', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'pc-react-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'pc-react-test' }, () => ({ contents: `import React from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export default React; export const {Children,Component,PureComponent,Fragment,StrictMode,Suspense,cloneElement,createContext,createElement,createRef,forwardRef,isValidElement,lazy,memo,startTransition,use,useCallback,useContext,useDebugValue,useDeferredValue,useEffect,useId,useImperativeHandle,useInsertionEffect,useLayoutEffect,useMemo,useReducer,useRef,useState,useSyncExternalStore,useTransition,version}=React;`, loader: 'js' }));
    builder.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom', namespace: 'pc-react-dom-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'pc-react-dom-test' }, () => ({ contents: `import ReactDOM from '${new URL('/@id/react-dom', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export default ReactDOM; export const {createPortal,flushSync}=ReactDOM;`, loader: 'js' }));
    builder.onResolve({ filter: /^react\/jsx-(?:dev-)?runtime$/ }, () => ({ path: 'jsx', namespace: 'pc-jsx-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'pc-jsx-test' }, () => ({ contents: `import React from '${new URL('/@id/react', process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href}'; export const Fragment=React.Fragment; export function jsx(type,props,key){return React.createElement(type,{...props,key})} export const jsxs=jsx; export const jsxDEV=jsx;`, loader: 'js' }));
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (args) => ({ path: new URL(`/@id/${args.path}`, process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187').href, external: true }));
    builder.onResolve({ filter: /(AuthContext|CampaignContext|campaignChannel|SessionChatPanel|supabaseClient)$/ }, (args) => ({ path: args.path.split('/').pop(), namespace: 'pc-browser-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'pc-browser-test' }, (args) => ({ contents: modules[args.path], loader: 'js' }));
  } }],
});
const source = bundle.outputFiles[0].text;
const browser = await startNoteBrowser();
try {
  await browser.evaluate(async (source) => {
    const id=(n)=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
    const react=await import('/@id/react');const h=(react.default||react).createElement;
    const dom=await import('/@id/react-dom/client');const {createRoot}=dom.default||dom;
    const s=window.__PC={ user:{id:id(1),displayName:'Alice'},campaign:{id:id(6),ownerId:id(4)},people:[
      {profile_id:id(1),display_name:'Alice',is_gm:false},{profile_id:id(2),display_name:'Bob',is_gm:false},
      {profile_id:id(3),display_name:'Carol',is_gm:false},{profile_id:id(4),display_name:'GM',is_gm:true}],
      presence:{a:[{profileId:id(1)}],b:[{profileId:id(2)}],duplicate:[{profileId:id(2)}],gm:[{profileId:id(4)}]},
      rows:[],calls:[],listeners:new Set(),presenceListeners:new Set(),assets:new Map(),nextId:10 };
    s.row=(sender,recipient,content,attachment)=>({id:id(s.nextId++),campaign_id:id(6),sender_id:id(sender),recipient_id:id(recipient),sender_name:s.people.find(p=>p.profile_id===id(sender)).display_name,recipient_name:s.people.find(p=>p.profile_id===id(recipient)).display_name,kind:attachment?'attachment':'message',content,payload:attachment?{attachment}:null,created_at:new Date().toISOString(),deleted_at:null});
    const query=()=>{
      const state={filters:[],limit:Infinity};
      const result=()=>{
        if(state.insert){const value=state.insert;const row=s.row(1,Number(value.recipient_id.slice(-12)),value.content,value.payload?.attachment);s.rows.push(row);return {data:row,error:null};}
        let rows=s.rows.filter(row=>row.sender_id===s.user.id||row.recipient_id===s.user.id);
        for(const [field,value] of state.filters) rows=rows.filter(row=>row[field]===value);
        if(state.peer) rows=rows.filter(row=>row.sender_id===state.peer||row.recipient_id===state.peer);
        rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
        return {data:rows.slice(0,state.limit),error:null};
      };
      const chain={select(){return chain},eq(field,value){state.filters.push([field,value]);return chain},is(field,value){state.filters.push([field,value]);return chain},or(value){const match=/sender_id.eq.([^,)]+)/.exec(value);if(match)state.peer=match[1];return chain},order(){return chain},limit(value){state.limit=value;return chain},insert(value){state.insert=value;s.calls.push({operation:'insert',...value});return chain},single(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
      return chain;
    };
    s.client={rpc:async()=>({data:s.people,error:null}),from(table){s.calls.push({operation:'query',table});if(table!=='private_chat_messages')throw Error('Unexpected public table');return query()},
      channel(){const handlers=[];const channel={on(type,filter,callback){handlers.push({filter,callback});return channel},subscribe(callback){s.listeners.add(handlers);setTimeout(()=>callback('SUBSCRIBED'),0);return channel},handlers};return channel},removeChannel(channel){s.listeners.delete(channel.handlers);return Promise.resolve()},
      storage:{from(bucket){return {upload:async(path,file)=>{s.calls.push({operation:'upload',bucket,path});s.assets.set(path,file);return {error:null}},download:async(path)=>({data:s.assets.get(path),error:null}),remove:async(paths)=>{paths.forEach(path=>s.assets.delete(path));return {error:null}},getPublicUrl(){throw Error('Private publicUrl forbidden')}}}}};
    s.emit=(row)=>{s.rows.push(row);for(const handlers of s.listeners)for(const handler of handlers)if(handler.filter.event==='INSERT')handler.callback({new:row})};
    const host=document.createElement('div');
    host.style.cssText='position:fixed;top:16px;left:16px;width:340px;height:700px;z-index:99999;background:#222;--dash-text:#ddd;--dash-text-strong:#fff;--dash-muted:#aaa;--dash-border:#666;--dash-panel:#252525;--dash-surface:#333;--dash-surface-2:#383838;--dash-accent:#d4aa68;--dash-danger-text:#f99';
    document.body.appendChild(host);s.host=host;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const {CampaignChatPanel}=await import(url);URL.revokeObjectURL(url);
    s.root=createRoot(host);s.render=()=>s.root.render(h(CampaignChatPanel,{incomingMessage:null,onPrivateConversationChange:(value)=>s.privateOpen=value}));s.render();
  }, source);
  await sleep(600);
  const initial = await browser.evaluate(() => ({ portraits:document.querySelectorAll('[data-campaign-online-portraits] button[aria-label^="Messaggio privato"]').length, text:window.__PC.host.textContent }));
  assert.equal(initial.portraits, 3, 'solo Alice/Bob/GM online, Bob deduplicato');
  assert.ok(!initial.text.includes('Carol'));
  await browser.evaluate(() => document.querySelector('button[aria-label="Messaggio privato a Bob"]').click());
  await sleep(300);
  assert.equal(await browser.evaluate(() => window.__PC.privateOpen), true);
  assert.equal(await browser.evaluate(() => !!document.querySelector('[data-private-chat-panel]')), true);
  await browser.evaluate(() => {
    const input=document.querySelector('input[aria-label="Messaggio privato a Bob"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Segreto per Bob');
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await sleep(60);
  await browser.evaluate(() => document.querySelector('[data-private-chat-panel] form').requestSubmit());
  await sleep(300);
  const sent = await browser.evaluate(() => ({insert:window.__PC.calls.find(call=>call.operation==='insert'),text:window.__PC.host.textContent}));
  assert.equal(sent.insert.recipient_id, '10000000-0000-0000-0000-000000000002');
  assert.equal(sent.insert.content, 'Segreto per Bob');
  assert.ok(sent.text.includes('Segreto per Bob'));
  await browser.evaluate(() => {
    window.__PC.presence={alice:[{profileId:window.__PC.user.id}],gm:[{profileId:window.__PC.campaign.ownerId}]};
    window.__PC.presenceListeners.forEach(listener=>listener());
  });
  await sleep(200);
  assert.equal(await browser.evaluate(() => document.querySelectorAll('[data-campaign-online-portraits] button[aria-label^="Messaggio privato"]').length), 2);
  assert.ok(await browser.evaluate(() => window.__PC.host.textContent.includes('Offline')));
  await browser.evaluate(() => document.querySelector('button[aria-label="Torna alla chat campagna"]').click());
  await sleep(120);
  await browser.evaluate(() => window.__PC.emit(window.__PC.row(2,1,'Risposta privata mentre leggo il pubblico')));
  await sleep(200);
  assert.equal(await browser.evaluate(() => !!document.querySelector('[data-public-chat-test]')), true);
  assert.equal(await browser.evaluate(() => window.__PC.host.textContent.includes('Risposta privata mentre leggo il pubblico')), false, 'nessun testo privato nella chat pubblica');
  assert.ok(await browser.evaluate(() => [...window.__PC.host.querySelectorAll('button')].some(button=>button.textContent.includes('Bob')&&button.textContent.includes('1'))), 'badge privato non letto');
  await browser.evaluate(() => [...window.__PC.host.querySelectorAll('button')].find(button=>button.textContent.includes('Bob')).click());
  await sleep(250);
  assert.ok(await browser.evaluate(() => window.__PC.host.textContent.includes('Risposta privata mentre leggo il pubblico')));
  await browser.evaluate(async () => {
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=300;
    const context=canvas.getContext('2d');context.fillStyle='#a36';context.fillRect(0,0,600,300);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const file=new File([blob],'secret-picture.png',{type:'image/png'});
    const transfer=new DataTransfer();transfer.items.add(file);
    const input=document.querySelector('[data-private-chat-panel] input[accept="image/*"]');
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await sleep(500);
  const image=await browser.evaluate(()=>{
    const img=document.querySelector('img[alt="secret-picture.png"]');
    const upload=window.__PC.calls.find(call=>call.operation==='upload');
    const sent=window.__PC.calls.find(call=>call.operation==='insert'&&call.payload?.attachment?.display==='image');
    return {upload,sent,width:img?.clientWidth,height:img?.clientHeight,panel:document.querySelector('[data-private-chat-panel]').clientWidth};
  });
  assert.equal(image.upload.bucket,'private-chat-attachments');
  assert.ok(image.upload.path.includes('/10000000-0000-0000-0000-000000000002/'));
  assert.equal(image.sent.payload.attachment.imageWidth,600);
  assert.equal(image.sent.payload.attachment.imageHeight,300);
  assert.ok(image.width>0&&image.width<image.panel);
  assert.ok(Math.abs(image.width/image.height-2)<0.03,'immagine privata proporzionale');
  await browser.evaluate(()=>{
    const transfer=new DataTransfer();transfer.items.add(new File(['private document'],'secret-document.pdf',{type:'application/pdf'}));
    const input=document.querySelector('[data-private-chat-panel] input[type="file"]:not([accept])');
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await sleep(300);
  assert.ok(await browser.evaluate(()=>window.__PC.host.textContent.includes('secret-document.pdf')));
  assert.ok(await browser.evaluate(()=>window.__PC.calls.filter(call=>call.operation==='upload').every(call=>call.bucket==='private-chat-attachments')));
  for (const width of [340, 480]) {
    const dimensions=await browser.evaluate((width)=>{window.__PC.host.style.width=`${width}px`;const panel=document.querySelector('[data-private-chat-panel]');return {width:panel.clientWidth,scroll:panel.scrollWidth,host:window.__PC.host.clientWidth};},width);
    assert.ok(dimensions.scroll<=dimensions.width+1, `overflow orizzontale a ${width}px`);
    assert.equal(dimensions.width, dimensions.host);
  }
  await browser.evaluate(()=>{window.__PC.user={id:window.__PC.campaign.ownerId,displayName:'GM'};window.__PC.render()});
  await sleep(300);
  assert.equal(await browser.evaluate(()=>!!document.querySelector('[data-private-chat-panel]')),false,'cambio account chiude il vecchio privato');
  assert.equal(await browser.evaluate(()=>window.__PC.host.textContent.includes('Bob')),false,'cronologia del precedente account non riutilizzata');
  console.log('Private chat browser: PASS (online portraits, duplicate/offline filtering, recipient targeting, public/private isolation, unread inbox, private images/files, proportional preview, narrow-panel layout).');
} finally { await browser.close(); }
