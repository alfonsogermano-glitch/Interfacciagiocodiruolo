// Shared validation boundary for NPC, Monster, Clue and Situation documents.
// It preserves each original model as JSON while enforcing identity, placement,
// bounded structure and the minimum label required by its original UI.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NARRATIVE_KINDS=Object.freeze(['npcs','monsters','clues','events']);
const KINDS=new Set(NARRATIVE_KINDS);
const DIFFICULTIES=new Set(['','Base','Critico','Estremo','Impossibile','Non euclideo']);
const RULESETS=new Set(['hsc','dnd5e','pathfinder','coc7e','cocclassic','custom']);
const UUID_FIELDS=['baseMonsterId','mapLocationId','folderId','ownerProfileId','portraitAssetId'];
export class NarrativeContentRejected extends Error{
 constructor(message,status=400){super(message);this.status=status;}
}
function safeTree(value,depth=0){
 if(depth>12)return false;
 if(value===null||['string','boolean'].includes(typeof value))return typeof value!=='string'||value.length<=50000;
 if(typeof value==='number')return Number.isFinite(value);
 if(Array.isArray(value))return value.length<=1000&&value.every(item=>safeTree(item,depth+1));
 if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const entries=Object.entries(value);
 return entries.length<=250&&entries.every(([key,item])=>
  !['__proto__','prototype','constructor'].includes(key)&&key.length<=100&&safeTree(item,depth+1));
}
const optionalString=(value,max=50000)=>value===undefined||value===null||(typeof value==='string'&&value.length<=max);
const optionalBoolean=value=>value===undefined||value===null||typeof value==='boolean';
const optionalNumber=(value,min=-100000,max=100000)=>value===undefined||value===null||(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max);
const optionalUuid=value=>value===undefined||value===null||UUID.test(value);
function stringArray(value,{maxItems=1000,maxLength=2000}={}){
 return value===undefined||value===null||(Array.isArray(value)&&value.length<=maxItems&&value.every(item=>typeof item==='string'&&item.length<=maxLength));
}
function crop(value){
 return value===undefined||value===null||(value&&Object.getPrototypeOf(value)===Object.prototype&&
  optionalNumber(value.x,-10000,10000)&&optionalNumber(value.y,-10000,10000)&&optionalNumber(value.scale,0.01,100)&&
  Object.keys(value).every(key=>['x','y','scale'].includes(key)));
}
function customEntries(value){
 return value===undefined||value===null||(Array.isArray(value)&&value.length<=200&&value.every(item=>item&&Object.getPrototypeOf(item)===Object.prototype&&
  typeof item.id==='string'&&item.id.length<=200&&typeof item.name==='string'&&item.name.length<=500&&
  typeof item.description==='string'&&item.description.length<=10000&&Object.keys(item).every(key=>['id','name','description'].includes(key))));
}
function d20Stats(value){
 if(value===undefined||value===null)return true;
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;
 const numeric=['hp','maxHp','ac','speed','str','dex','con','int','wis','cha','level','proficiencyBonus'];
 const textual=['className','challengeRating','creatureType'];
 return Object.keys(value).every(key=>numeric.includes(key)||textual.includes(key))&&
  numeric.every(key=>optionalNumber(value[key],-1000,10000))&&textual.every(key=>optionalString(value[key],200));
}
export function validateOriginalEntityFields(kind,draft){
 if(kind!=='npcs'&&kind!=='monsters')return;
 for(const key of UUID_FIELDS)if(!optionalUuid(draft[key]))throw new NarrativeContentRejected('Riferimento contenuto non valido');
 for(const key of ['portraitFrameAssetId','coverFrameAssetId'])
  if(draft[key]!==undefined&&draft[key]!==null&&draft[key]!=='__none__'&&!UUID.test(draft[key]))
   throw new NarrativeContentRejected('Riferimento cornice non valido');
 if(draft.ruleset!==undefined&&draft.ruleset!==null&&!RULESETS.has(draft.ruleset))throw new NarrativeContentRejected('Regolamento contenuto non valido');
 for(const key of ['role','description','personality','secrets','location','customLocationName','puntoDebole','notes','tokenColor','tokenBackgroundColor','tokenBorderStyle','tokenBorderThickness','tokenBorderLabel'])
  if(!optionalString(draft[key],key==='description'||key==='notes'||key==='secrets'?50000:4000))throw new NarrativeContentRejected('Campo testuale contenuto non valido');
 for(const key of ['visibleToPlayers','requestable','tokenBorderVisible','isCustom'])
  if(!optionalBoolean(draft[key]))throw new NarrativeContentRejected('Campo booleano contenuto non valido');
 for(const key of ['freschezza','maxFreschezza','audacia','portraitFrameRotationDegrees','portraitFrameOffsetX','portraitFrameOffsetY','portraitFrameScaleX','portraitFrameScaleY','portraitRotationDegrees','coverImageScale','coverRotationDegrees','frameRotationDegrees','coverFrameOffsetX','coverFrameOffsetY','coverFrameScaleX','coverFrameScaleY'])
  if(!optionalNumber(draft[key]))throw new NarrativeContentRejected('Campo numerico contenuto non valido');
 for(const key of ['attacco','difesa','tiroFollia'])
  if(draft[key]!==undefined&&draft[key]!==null&&!DIFFICULTIES.has(draft[key]))throw new NarrativeContentRejected('Difficoltà contenuto non valida');
 for(const key of ['tags','tratti','trattiPersonalizzati','azioniSpeciali','azioniSpecialiPersonalizzate','traitIds','specialActionIds','tabOrder'])
  if(!stringArray(draft[key]))throw new NarrativeContentRejected('Elenco contenuto non valido');
 for(const key of ['caselleFrischezzaCruciali','caselleFreschezzaCritiche'])
  if(draft[key]!==undefined&&(!Array.isArray(draft[key])||draft[key].length>1000||draft[key].some(value=>!Number.isInteger(value)||value<0||value>10000)))
   throw new NarrativeContentRejected('Caselle freschezza non valide');
 if(!customEntries(draft.customTraits)||!customEntries(draft.customSpecialActions))throw new NarrativeContentRejected('Voci personalizzate non valide');
 if(!crop(draft.portraitCrop)||!crop(draft.coverCrop))throw new NarrativeContentRejected('Ritaglio immagine non valido');
 if(!d20Stats(draft.d20Stats))throw new NarrativeContentRejected('Statistiche d20 non valide');
}
function validateArubaNarrativeMedia(campaignId,kind,draft){
 if(kind!=='npcs'&&kind!=='monsters')return;
 const prefix=`/vtt/campaigns/${campaignId}/visual-assets/`;
 for(const key of ['portraitImageUrl','portraitSourceImageUrl','coverImageUrl','imageUrl']){
  const value=draft[key];
  if(value===undefined||value===null||value==='')continue;
  if(typeof value!=='string'||!value.startsWith(prefix)||!value.endsWith('/content'))
   throw new NarrativeContentRejected('Immagine narrativa non Aruba');
  const id=value.slice(prefix.length,-'/content'.length);
  if(!UUID.test(id))throw new NarrativeContentRejected('Riferimento immagine narrativa non valido');
 }
}
export function validateNarrativeContentDraft(campaignId,kind,draft){
 if(!UUID.test(campaignId??''))throw new NarrativeContentRejected('Campagna non valida');
 if(!KINDS.has(kind))throw new NarrativeContentRejected('Tipo contenuto non valido');
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||!safeTree(draft)||
  JSON.stringify(draft).length>100000)throw new NarrativeContentRejected('Contenuto narrativo non valido');
 if(!UUID.test(draft.id??'')||(draft.campaignId!==undefined&&draft.campaignId!==campaignId))
  throw new NarrativeContentRejected('Identità contenuto non valida');
 for(const key of ['chapterId','sceneId','environmentId'])
  if(draft[key]!==undefined&&draft[key]!==null&&!UUID.test(draft[key]))
   throw new NarrativeContentRejected('Collocazione contenuto non valida');
 if(draft.sceneId&&!draft.chapterId)throw new NarrativeContentRejected('Una Scena richiede il Capitolo');
 if(draft.environmentId!=null||draft.mapLocationId!=null||draft.folderId!=null)
  throw new NarrativeContentRejected('Collocazione non ancora supportata su Aruba');
 const label=kind==='clues'||kind==='events'?draft.title:draft.name;
  if(typeof label!=='string'||!label.trim()||label.trim().length>200)
   throw new NarrativeContentRejected('Titolo contenuto non valido');
  if(kind==='events'&&(
   !Array.isArray(draft.consequences)||draft.consequences.length>100||draft.consequences.some(item=>typeof item!=='string'||item.length>2000)||
   !Array.isArray(draft.choices)||draft.choices.length>100||draft.choices.some(choice=>!choice||Object.getPrototypeOf(choice)!==Object.prototype||typeof choice.text!=='string'||!choice.text.trim()||choice.text.length>1000||typeof choice.outcome!=='string'||choice.outcome.length>4000)))
    throw new NarrativeContentRejected('Scelte o conseguenze evento non valide');
  validateOriginalEntityFields(kind,draft);
  validateArubaNarrativeMedia(campaignId,kind,draft);
 const serialized=JSON.stringify(draft);
 if(/supabase(?:\.co|\.in)/i.test(serialized))throw new NarrativeContentRejected('Asset legacy non consentito');
 return Object.freeze({...structuredClone(draft),campaignId,[kind==='clues'||kind==='events'?'title':'name']:label.trim()});
}
