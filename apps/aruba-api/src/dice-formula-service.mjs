// Dice formulas persistence for Aruba. Owner-scoped, campaign-bound.
import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value,label){if(typeof value!=='string'||!UUID.test(value))throw new CampaignRejected(`${label} non valido`,400);return value;}
function mapRow(row){return {id:row.id,campaignId:row.campaign_id,ownerProfileId:row.owner_id,name:row.name,items:Array.isArray(row.items)?row.items:[],isSecret:row.is_secret,iconName:row.icon_name,folderId:row.folder_id,sortOrder:row.sort_order,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()};}

export function createDiceFormulaService({pool}){
  async function list(userId,campaignId){
    id(userId,'Utente');id(campaignId,'Campagna');
    const result=await pool.query('SELECT * FROM hollowgate_vtt.list_dice_formulas($1,$2)',[userId,campaignId]);
    return {formulas:result.rows.map(mapRow)};
  }
  async function create(userId,campaignId,body){
    id(userId,'Utente');id(campaignId,'Campagna');
    if(!body||typeof body!=='object'||Array.isArray(body))throw new CampaignRejected('Formula non valida',400);
    if(typeof body.name!=='string'||body.name.length<1||body.name.length>200)throw new CampaignRejected('Nome formula non valido',400);
    if(!Array.isArray(body.items))throw new CampaignRejected('Elementi formula non validi',400);
    const icon=body.iconName===undefined||body.iconName===null?null:(typeof body.iconName==='string'&&body.iconName.length>=1&&body.iconName.length<=100?body.iconName:null);
    const result=await pool.query('SELECT hollowgate_vtt.create_dice_formula($1,$2,$3,$4::jsonb,$5,$6) AS id',[userId,campaignId,body.name.trim(),JSON.stringify(body.items),body.isSecret===true,icon]);
    const formulaId=result.rows[0]?.id;
    if(!formulaId)throw new CampaignRejected('Campagna non autorizzata',404);
    const rows=await pool.query('SELECT * FROM hollowgate_vtt.list_dice_formulas($1,$2) WHERE id=$3',[userId,campaignId,formulaId]);
    if(rows.rows.length!==1)throw new Error('Formula creation failed');
    return {formula:mapRow(rows.rows[0])};
  }
  async function update(userId,formulaId,body){
    id(userId,'Utente');id(formulaId,'Formula');
    if(!body||typeof body!=='object'||Array.isArray(body))throw new CampaignRejected('Patch non valida',400);
    const name=body.name===undefined?null:(typeof body.name==='string'&&body.name.trim().length>=1&&body.name.trim().length<=200?body.name.trim():undefined);
    if(name===undefined&&body.name!==undefined)throw new CampaignRejected('Nome formula non valido',400);
    const items=body.items===undefined?null:(Array.isArray(body.items)?body.items:undefined);
    if(items===undefined&&body.items!==undefined)throw new CampaignRejected('Elementi formula non validi',400);
    const secret=body.isSecret===undefined?null:body.isSecret===true;
    const icon=body.iconName===undefined?null:(body.iconName===null?'__NULL__':(typeof body.iconName==='string'&&body.iconName.length>=1&&body.iconName.length<=100?body.iconName:undefined));
    if(icon===undefined&&body.iconName!==undefined)throw new CampaignRejected('Icona formula non valida',400);
    const result=await pool.query('SELECT hollowgate_vtt.update_dice_formula($1,$2,$3,$4::jsonb,$5,$6) AS ok',[userId,formulaId,name,items===null?null:JSON.stringify(items),secret,icon]);
    if(result.rows[0]?.ok!==true)throw new CampaignRejected('Formula non trovata o non autorizzata',404);
    return {updated:true};
  }
  async function remove(userId,formulaId){
    id(userId,'Utente');id(formulaId,'Formula');
    const result=await pool.query('SELECT hollowgate_vtt.delete_dice_formula($1,$2) AS ok',[userId,formulaId]);
    if(result.rows[0]?.ok!==true)throw new CampaignRejected('Formula non trovata o non autorizzata',404);
    return {deleted:true};
  }
  async function reorder(userId,campaignId,ids){
    id(userId,'Utente');id(campaignId,'Campagna');
    if(!Array.isArray(ids)||ids.length>500||!ids.every(x=>typeof x==='string'&&UUID.test(x)))throw new CampaignRejected('Lista ordinamento non valida',400);
    const result=await pool.query('SELECT hollowgate_vtt.reorder_dice_formulas($1,$2,$3) AS ok',[userId,campaignId,ids]);
    if(result.rows[0]?.ok!==true)throw new CampaignRejected('Campagna non autorizzata',404);
    return {reordered:true};
  }
  return {list,create,update,remove,reorder};
}
