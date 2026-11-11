const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hollowgateDesktop',Object.freeze({
 getTunnelUrl:()=>ipcRenderer.invoke('hollowgate:get-tunnel-url'),
 onTunnelUrl:callback=>{if(typeof callback==='function')ipcRenderer.on('hollowgate:tunnel-url',(_event,url)=>callback(url))}
}));
