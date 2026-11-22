/** Pure player media authorization for the read-only character sheet.
 * Frame ids and cover URLs are accepted only when they match one of the
 * assets returned by the player-scoped API for this same campaign. */
const CONTENT_PATH=/^\/vtt\/campaigns\/([0-9a-f-]{36})\/visual-assets\/([0-9a-f-]{36})\/content$/i;
const PORTRAIT_TYPES=new Set(['portrait-frame','portrait-frame-default']);
const COVER_TYPES=new Set(['frame','frame-default']);

export function resolveAuthorizedPlayerMedia(sheetData,campaignId,assets){
 const byId=new Map(assets.map(asset=>[asset.id.toLowerCase(),asset]));
 const frame=(value,types)=>{
  if(typeof value!=='string')return null;
  const asset=byId.get(value.toLowerCase());
  return asset&&types.has(asset.type)?value:null;
 };
 const rawCover=typeof sheetData?.coverImageUrl==='string'?sheetData.coverImageUrl:'';
 const match=CONTENT_PATH.exec(rawCover);
 const coverImageUrl=match&&match[1].toLowerCase()===campaignId.toLowerCase()&&
  byId.has(match[2].toLowerCase())?rawCover:undefined;
 return {
  coverImageUrl,
  portraitFrameAssetId:frame(sheetData?.portraitFrameAssetId,PORTRAIT_TYPES),
  coverFrameAssetId:frame(sheetData?.coverFrameAssetId,COVER_TYPES),
 };
}
