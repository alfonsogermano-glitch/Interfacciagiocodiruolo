const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES=new Set(['tascabile','trasportabile','risorsa','arma']);
const RARITIES=new Set(['common','rare','unique','story']);
export class EquipmentCatalogRejected extends Error{constructor(message,status=400){super(message);this.status=status;}}
const strings=(value,max=100)=>Array.isArray(value)&&value.length<=max&&value.every(item=>typeof item==='string'&&item.length<=200);
const ids=value=>strings(value)&&value.every(item=>UUID.test(item));
export function validateEquipmentCatalogDraft(campaignId,draft){
 if(!UUID.test(campaignId??''))throw new EquipmentCatalogRejected('Campagna non valida');
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||!UUID.test(draft.id??'')||
  (draft.campaignId!==undefined&&draft.campaignId!==campaignId))throw new EquipmentCatalogRejected('Identità oggetto non valida');
 if(typeof draft.name!=='string'||!draft.name.trim()||draft.name.trim().length>200||
  typeof draft.description!=='string'||draft.description.length>20000||!TYPES.has(draft.type)||!RARITIES.has(draft.rarity))
  throw new EquipmentCatalogRejected('Dati oggetto non validi');
 for(const key of ['isVehicle','isClue','isStoryItem','isActive','isPublic'])if(typeof draft[key]!=='boolean')throw new EquipmentCatalogRejected('Stato oggetto non valido');
 if(!strings(draft.tags,50)||!ids(draft.linkedEnvironmentIds)||!ids(draft.linkedNpcIds)||!ids(draft.linkedMonsterIds))
  throw new EquipmentCatalogRejected('Collegamenti oggetto non validi');
 for(const key of ['imageAssetId','iconId','containerItemId'])if(draft[key]!==null&&draft[key]!==undefined&&!UUID.test(draft[key]))throw new EquipmentCatalogRejected('Asset oggetto non valido');
 if(draft.iconColor!==null&&draft.iconColor!==undefined&&(typeof draft.iconColor!=='string'||draft.iconColor.length>40))throw new EquipmentCatalogRejected('Colore icona non valido');
 if(/supabase(?:\.co|\.in)/i.test(JSON.stringify(draft)))throw new EquipmentCatalogRejected('Asset legacy non consentito');
 return Object.freeze({...structuredClone(draft),campaignId,name:draft.name.trim(),source:'gm_custom'});
}
