import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
export async function startNoteBrowser() {
  const chromePath = [process.env.CHROME_PATH, 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(value => value && existsSync(value));
  if (!chromePath) throw new Error('Chrome/Chromium required: set CHROME_PATH to its executable.');
  const project = fileURLToPath(new URL('../', import.meta.url));
  const url = process.env.NOTE_TEST_URL || 'http://127.0.0.1:5187';
  const base = new URL(url);
  let vite, chrome, cdp, output = '';
  const temp = path.join(os.tmpdir(), 'opencode'); mkdirSync(temp, { recursive: true });
  const profile = mkdtempSync(path.join(temp, 'notes-regression-'));
  const close = async () => {
    if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.close(); }
    chrome?.kill(); vite?.kill();
    await sleep(250);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chromium may still be releasing its profile. */ }
  };
  try {
    let running = false;
    try { running = (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch {}
    if (!running) {
      if (process.env.NOTE_TEST_URL) throw new Error(`NOTE_TEST_URL is not reachable: ${url}`);
      vite = spawn(process.execPath, [path.join(project,'node_modules/vite/bin/vite.js'), '--host','127.0.0.1','--port',base.port,'--strictPort'], { cwd: project, stdio:['ignore','pipe','pipe'] });
      vite.stdout.on('data', data => { output += data; }); vite.stderr.on('data', data => { output += data; });
      for (let i=0;i<100;i++) {
        await sleep(100);
        try { if ((await fetch(url)).ok) { running = true; break; } } catch {}
        if (vite.exitCode !== null) break;
      }
      if (!running) throw new Error(`Vite failed to start:\n${output}`);
    }
    const port = await freePort();
    chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--disable-gpu','--no-first-run','about:blank'], {stdio:'ignore'});
    let tab;
    for (let i=0;i<100;i++) {
      try { tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {method:'PUT'})).json(); break; } catch { await sleep(100); }
    }
    if (!tab?.webSocketDebuggerUrl) throw new Error('Chrome CDP did not start.');
    // Initial navigation must finish before focus/device emulation commands.
    await sleep(3000);
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve,reject) => { ws.onopen=resolve;ws.onerror=reject; });
    let sequence = 0;
    const pending = new Map();
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    };
    cdp = {
      send(method,params={}) {
        return new Promise((resolve,reject) => {
          const id=++sequence;
          const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},120000);
          pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
        });
      },
      close(){for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('CDP closed'));}pending.clear();ws.close();},
    };
    await cdp.send('Page.enable');await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await sleep(1800);
    const evaluate = async (fn,...args) => {
      const expression = typeof fn === 'string' ? fn : `(${fn.toString()})(${args.map(arg=>JSON.stringify(arg)).join(',')})`;
      const result = await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
      if(result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const key = async key => {
      const codes={ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Enter:13,Escape:27,Backspace:8,Delete:46};
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:codes[key]});
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});await sleep(30);
    };
    const click = async (x,y) => {
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});await sleep(50);
    };
    return {cdp,evaluate,key,click,close,url,profile};
  } catch(error) { await close();throw error; }
}
