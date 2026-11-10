// Experimental Wi-Fi-only attempt: both peers must use the same ICE configuration.
// The room prefix carries the choice, not an extra configuration on Android.
export const LAN_PREFIX='L';
export const DEFAULT_PREFIX='W';
export const LOCAL_ICE=Object.freeze({iceServers:[]});
export function roomIceMode(code){
 return String(code||'').toUpperCase().startsWith(LAN_PREFIX)?'lan':'standard';
}
export function encodeRoomMode(randomCode,lan){
 if(typeof randomCode!=='string'||! /^[A-HJ-NP-Z2-9]{12}$/.test(randomCode))throw Error('Invalid room code');
 return (lan?LAN_PREFIX:DEFAULT_PREFIX)+randomCode.slice(1);
}
export function iceConfigForRoom(code,normal){
 return roomIceMode(code)==='lan'?{iceServers:[]}:normal;
}
