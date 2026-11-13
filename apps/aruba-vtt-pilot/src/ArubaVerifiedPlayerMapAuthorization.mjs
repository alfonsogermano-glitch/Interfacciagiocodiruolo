/**
 * Opt-in GM-side authorization of original player map requests.
 * The actor identity MUST come from verified Aruba signaling, never the
 * payload. This returns a sanitized request, not a state mutation, and
 * must be called inside the trusted GM event handler on current map state.
 *
 * This subset also rejects requests for hidden map objects even where the
 * original UI assumes that hidden object IDs will never reach a player.
 * This conservative subset deliberately excludes create/delete/magnet,
 * history, drag previews and all unreviewed operations. It is NOT wired to
 * SessionWorkspace and must not change the legacy map behavior.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const point=x=>object(x)&&Number.isFinite(x.x)&&Number.isFinite(x.y);
const allowedMove=new Set(['forward','backward','front','back']);
const tokenFields=new Set(['name','showLabel','labelColor','conditions','light','vision']);
const poiFields=new Set(['iconName','color','size','rotation','label',
 'labelVisible','noteId','noteVisibleToPlayers','light','vision']);
const mapFamilies={token:'mapTokens',poi:'mapPois',drawing:'mapDrawings'};
function clone(value){
 try{return JSON.parse(JSON.stringify(value));}catch{return null;}
}
function strictIds(ids){
 return Array.isArray(ids)&&ids.length>0&&ids.every(id=>typeof id==='string'&&id.length>0)&&new Set(ids).size===ids.length;
}
function validateCommon({authenticatedUserId,gmUserId,verifiedCampaignId,campaignId,chapterId,state,payload}){
 return uuid.test(authenticatedUserId)&&uuid.test(gmUserId)&&
  authenticatedUserId!==gmUserId&&verifiedCampaignId===campaignId&&
  uuid.test(campaignId)&&typeof chapterId==='string'&&!!chapterId&&
  object(state)&&object(payload)&&payload.chapterId===chapterId&&
  Array.isArray(state.mapTokens)&&Array.isArray(state.mapPois)&&
  Array.isArray(state.mapDrawings);
}
function currentObject(state,family,id){
 const list=state[mapFamilies[family]];
 return list.find(item=>item?.id===id);
}
const mobile=item=>!!item&&item.locked!==true&&item.pinned!==true;
const controlled=(item,actor)=>mobile(item)&&item.createdByProfileId===actor;
function pickAllowed(input,keys){
 if(!object(input)||Object.keys(input).length===0)return null;
 if(Object.keys(input).some(k=>!keys.has(k)))return null;
 const copy=clone(input);
 return object(copy)?copy:null;
}
/**
 * Return normalized {event,actorProfileId,chapterId,...} or null.
 * GM identity is deliberately not accepted here: original player requests
 * must never be able to request authoritative scene publication.
 */
export function authorizeVerifiedPlayerMapRequest({
 authenticatedUserId,gmUserId,verifiedCampaignId,campaignId,
 chapterId,state,event,payload,
}={}){
 if(!validateCommon({authenticatedUserId,gmUserId,verifiedCampaignId,campaignId,chapterId,state,payload}))
  return null;
 // Ignore but never trust the profile identity supplied by peer data.
 if(payload.actorProfileId!==undefined&&payload.actorProfileId!==authenticatedUserId)
  return null;
 const base={event,actorProfileId:authenticatedUserId,chapterId};
 if(event==='map_token_action'){
  if(payload.action==='move'&&object(payload.positions)){
   const entries=Object.entries(payload.positions);
   if(entries.length===0||entries.length>128)return null;
   const positions={};
   for(const [id,value] of entries){
    const token=currentObject(state,'token',id);
    if(!point(value)||!mobile(token)||token.visible===false)return null;
    positions[id]={x:value.x,y:value.y};
   }
   return {...base,action:'move',positions};
  }
  if(!strictIds(payload.tokenIds))return null;
  if(!payload.tokenIds.every(id=>{const token=currentObject(state,'token',id);
    return controlled(token,authenticatedUserId)&&token.visible!==false;}))
   return null;
  if(payload.action==='transform'&&object(payload.updates)){
   const ids=Object.keys(payload.updates);
   if(ids.length!==payload.tokenIds.length||!ids.every(id=>payload.tokenIds.includes(id)))
    return null;
   const updates={};
   for(const id of ids){
    const update=payload.updates[id];
    if(!object(update)||!point(update)||!Number.isFinite(update.size)||
      !Number.isFinite(update.rotation)||update.size<=0)return null;
    updates[id]={x:update.x,y:update.y,size:update.size,rotation:update.rotation};
   }
   return {...base,action:'transform',tokenIds:[...payload.tokenIds],updates};
  }
  if(payload.action==='update'){
   const update=pickAllowed(payload.update,tokenFields);
   return update?{...base,action:'update',tokenIds:[...payload.tokenIds],update}:null;
  }
  if(payload.action==='layer'&&allowedMove.has(payload.move))
   return {...base,action:'layer',tokenIds:[...payload.tokenIds],move:payload.move};
  return null;
 }
 if(event==='map_poi_action'){
  const poi=currentObject(state,'poi',payload.poiId);
  if(typeof payload.poiId!=='string'||!poi)return null;
  if(payload.action==='move'&&mobile(poi)&&poi.visibleToPlayers!==false&&point(payload.position))
   return {...base,action:'move',poiId:payload.poiId,
    position:{x:payload.position.x,y:payload.position.y}};
  if(payload.action==='update'&&controlled(poi,authenticatedUserId)&&poi.visibleToPlayers!==false){
   const update=pickAllowed(payload.update,poiFields);
   return update?{...base,action:'update',poiId:payload.poiId,update}:null;
  }
  return null;
 }
 if(event==='map_object_layer_action'){
  if(!Array.isArray(payload.refs)||payload.refs.length===0||
   payload.refs.length>128||!allowedMove.has(payload.move))return null;
  const ids=new Set();
  for(const ref of payload.refs){
   if(!object(ref)||!Object.hasOwn(mapFamilies,ref.family)||
    typeof ref.id!=='string'||!ref.id)return null;
   const key=ref.family+'\\u0000'+ref.id;
   if(ids.has(key))return null;
   ids.add(key);
   const item=currentObject(state,ref.family,ref.id);
   if(!controlled(item,authenticatedUserId)||
    (ref.family==='poi'?item.visibleToPlayers===false:item.visible===false))return null;
  }
  return {...base,refs:payload.refs.map(({family,id})=>({family,id})),move:payload.move};
 }
 return null;
}
