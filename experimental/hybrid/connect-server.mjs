/**
 * Local-only Connect preview server for behind a future reviewed HTTPS proxy.
 * This executable intentionally refuses to listen publicly.
 */
import { createSignalingHub } from './signaling-hub.mjs';

const port=Number(process.env.CONNECT_PORT ?? 8787);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('CONNECT_PORT must be between 1024 and 65535');
const origin=process.env.CONNECT_ALLOWED_ORIGIN || 'https://alfonsogermano-glitch.github.io';
const hub=createSignalingHub({hostname:'127.0.0.1',port,allowedOrigins:[origin]});
const url=await hub.start();
console.log('Hollowgate Connect (localhost-only) listening at '+url);
console.log('Only explicit Origin is accepted: '+origin);
console.log('TEST ONLY: no real user authentication; do NOT expose publicly.');
let stopping=false;
const stop=async()=>{
 if(stopping)return;stopping=true;
 await hub.close();
};
process.once('SIGINT',()=>{void stop()});
process.once('SIGTERM',()=>{void stop()});
