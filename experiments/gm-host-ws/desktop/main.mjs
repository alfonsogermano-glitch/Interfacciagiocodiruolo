import {app,BrowserWindow,ipcMain,dialog} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHostServer} from '../server.mjs';
import {createTunnelUrlScanner} from './tunnel-output.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),port=4177;
let hostServer,win,tunnel,tunnelUrl=null,quitting=false;
const sendTunnelUrl=url=>{tunnelUrl=url;if(win&&!win.isDestroyed())win.webContents.send('hollowgate:tunnel-url',url)};
function launchTunnel(){
 const filename=app.isPackaged?path.join(process.resourcesPath,'cloudflared.exe'):path.join(here,'bin','cloudflared-windows-amd64.exe');
 if(!fs.existsSync(filename)){dialog.showMessageBox(win,{type:'warning',title:'Tunnel non disponibile',message:'Cloudflare Tunnel non incluso. Sessione locale disponibile.'});return}
 tunnel=spawn(filename,['tunnel','--url','http://127.0.0.1:'+port],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 tunnel.stderr.on('data',createTunnelUrlScanner(sendTunnelUrl));
 tunnel.on('error',()=>dialog.showMessageBox(win,{type:'warning',title:'Tunnel esterno',message:'Impossibile avviare Cloudflare Tunnel.'}));
 tunnel.on('exit',()=>{sendTunnelUrl(null);if(!quitting&&win&&!win.isDestroyed())dialog.showMessageBox(win,{type:'warning',title:'Tunnel chiuso',message:'La connessione dei giocatori esterni si è interrotta.'})});
}
async function start(){
 if(!app.requestSingleInstanceLock()){app.quit();return}
 app.on('second-instance',()=>{win?.show();win?.focus()});
 hostServer=createHostServer({port,archiveFile:path.join(app.getPath('userData'),'campaign-demo.json')});
 let url;
 try{url=await hostServer.listen()}catch(error){dialog.showErrorBox('Host non disponibile',error.message);app.quit();return}
 ipcMain.handle('hollowgate:get-tunnel-url',()=>tunnelUrl);
 win=new BrowserWindow({width:1120,height:850,minWidth:720,minHeight:600,title:'Hollowgate GM Host — Demo',
  webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:false,webSecurity:true}
 });
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,target)=>{if(!target.startsWith('http://127.0.0.1:'+port+'/'))event.preventDefault()});
 win.on('closed',()=>{win=null;app.quit()});
 await win.loadURL(url);
 launchTunnel();
}
app.whenReady().then(start).catch(error=>{dialog.showErrorBox('Errore Hollowgate',error.message);app.quit()});
app.on('before-quit',()=>{quitting=true;if(tunnel&&!tunnel.killed)tunnel.kill()});
app.on('will-quit',()=>{if(hostServer)void hostServer.close().catch(()=>{})});
