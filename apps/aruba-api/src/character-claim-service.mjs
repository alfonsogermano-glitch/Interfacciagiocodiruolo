import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=value=>typeof value==='string'&&UUID.test(value);
const mapped=row=>({id:row.id,campaignId:row.campaign_id,ownerId:row.owner_id,name:row.name,
 sheetData:row.sheet_data,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at});
const validSheet=body=>body&&typeof body==='object'&&!Array.isArray(body)&&
 Object.keys(body).sort().join(',')==='campaignId,name,sheetData'&&typeof body.name==='string'&&
 body.name.trim().length>0&&body.name.trim().length<=120&&body.sheetData&&
 typeof body.sheetData==='object'&&!Array.isArray(body.sheetData)&&
 ['style','viaggio'].every(k=>typeof body.sheetData[k]==='string')&&
 ['ambiti','abilita'].every(k=>body.sheetData[k]&&typeof body.sheetData[k]==='object'&&!Array.isArray(body.sheetData[k]))&&
 ['tratti','equipment'].every(k=>Array.isArray(body.sheetData[k]))&&
 JSON.stringify(body.sheetData).length<=30000&&!/supabase[.]co|data:image\//i.test(JSON.stringify(body.sheetData));
export function createCharacterClaimService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function claim(playerId,characterId){
  if(!valid(playerId)||!valid(characterId))throw new CampaignRejected('Personaggio non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.claim_available_character($1,$2) AS campaign_id',[playerId,characterId]);
  const campaignId=rows[0]?.campaign_id;
  if(!valid(campaignId))throw new CampaignRejected('Personaggio non disponibile',409);
  return {characterId,campaignId};
 }
 async function release(playerId,characterId){
  if(!valid(playerId)||!valid(characterId))throw new CampaignRejected('Personaggio non valido',400);
  const {rows}=await pool.query('SELECT hollowgate_vtt.release_claimed_character($1,$2) AS character_id',[playerId,characterId]);
  const releasedId=rows[0]?.character_id;
  if(releasedId!==characterId)throw new CampaignRejected('Personaggio non posseduto',409);
  return {characterId};
 }
 return {
  async list(playerId,campaignId){
   if(!valid(playerId)||!valid(campaignId))throw new CampaignRejected('Campagna non valida',400);
   const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_claimable_characters($1,$2)',[playerId,campaignId]);
   return {characters:rows.map(row=>({id:row.id,campaignId:row.campaign_id,ownerId:row.owner_id,name:row.name,
    sheetData:row.sheet_data,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at}))};
  },
  async current(playerId,campaignId){
   if(!valid(playerId)||!valid(campaignId))throw new CampaignRejected('Campagna non valida',400);
   const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.get_player_character_claim($1,$2)',[playerId,campaignId]);
   if(rows.length>1)throw new Error('Invalid character claim state');
   const row=rows[0];return {claim:row?{characterId:row.character_id,claimedAt:row.claimed_at}:null};
  },
  async owned(ownerId,campaignId){
   if(!valid(ownerId)||!valid(campaignId))throw new CampaignRejected('Campagna non valida',400);
   const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_owned_character_claims($1,$2)',[ownerId,campaignId]);
   return {claims:rows.map(row=>({characterId:row.character_id,playerId:row.player_id,claimedAt:row.claimed_at}))};
  },
  async save(playerId,campaignId,characterId,body){
   if(!valid(playerId)||!valid(campaignId)||!valid(characterId)||!validSheet(body)||body.campaignId!==campaignId)
    throw new CampaignRejected('Scheda non valida o contiene immagini non ancora migrate',400);
   const {rows}=await pool.query('SELECT hollowgate_vtt.save_claimed_character_sheet($1,$2,$3,$4,$5::jsonb) AS id',
    [playerId,campaignId,characterId,body.name.trim(),JSON.stringify(body.sheetData)]);
   if(rows[0]?.id!==characterId)throw new CampaignRejected('Personaggio non trovato o claim non valido',404);
   const fresh=await pool.query('SELECT * FROM hollowgate_vtt.list_assigned_player_character_sheets($1,$2)',[playerId,campaignId]);
   const row=fresh.rows.find(item=>item.id===characterId);
   if(!row)throw new CampaignRejected('Personaggio non più autorizzato',404);
   return {character:mapped(row)};
  },
  claim,
  release,
 };
}
