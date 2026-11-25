// Same persisted keys and desktop limits as original SessionRightSidebar.
export const SHEETS_PANEL_KEY='hollowgate.characters.panel-width';
export const SHEETS_SIDEBAR_KEY='hollowgate.characters.sidebar-width';
export function clampSheetsPanel(width,viewport){
 const maximum=Math.max(0,viewport-100-80-16);
 return Math.min(Math.max(Number.isFinite(width)?width:1024,Math.min(640,maximum)),maximum);
}
export function clampSheetsSidebar(width,panel){
 if(panel<560)return Math.max(80,Math.min(panel*.3,192));
 return Math.min(Math.max(Number.isFinite(width)?width:256,192),Math.max(192,panel-360));
}
export function readSheetsWidth(storage,key,fallback){
 try{
  const stored=(typeof storage==='function'?storage():storage).getItem(key);
  if(stored===null)return fallback;
  const value=Number(stored);
  return Number.isFinite(value)?value:fallback;
 }catch{return fallback;}
}
