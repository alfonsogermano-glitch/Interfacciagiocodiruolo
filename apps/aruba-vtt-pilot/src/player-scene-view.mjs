/** Validate a player-visible scene snapshot before handing it to a renderer.
 * All fields are bounded and copied; no GM-only metadata crosses this boundary. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000;
export function validatePlayerSceneSnapshot(snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
  !UUID.test(snapshot.sceneId??'')||!Array.isArray(snapshot.tokens)||snapshot.tokens.length>500)
  throw new TypeError('Invalid player scene snapshot');
 const seen=new Set();const tokens=[];
 for(const token of snapshot.tokens){
  if(!token||typeof token!=='object'||Array.isArray(token)||
   !UUID.test(token.id??'')||seen.has(token.id)||
   typeof token.name!=='string'||token.name.length<1||token.name.length>120||
   !finite(token.x)||!finite(token.y)||!Number.isInteger(token.size)||
   token.size<1||token.size>20||token.visible!==true)
   throw new TypeError('Invalid player token');
  seen.add(token.id);
  tokens.push({id:token.id,name:token.name,x:token.x,y:token.y,size:token.size,visible:true});
 }
 return {sceneId:snapshot.sceneId,tokens};
}
/** Only a valid, newer GM snapshot can update the visible scene. */
export function createPlayerSceneView(){
 let revision=0,scene=null;
 return {
  apply({revision:nextRevision,state}={}){
   if(!Number.isSafeInteger(nextRevision)||nextRevision<=revision)return false;
   let next;try{next=validatePlayerSceneSnapshot(state);}catch{return false;}
   revision=nextRevision;scene=next;return true;
  },
  getScene(){return scene?{revision,scene:structuredClone(scene)}:null;},
  reset(){revision=0;scene=null;},
 };
}
