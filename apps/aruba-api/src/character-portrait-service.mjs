import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES=524288;
const MAX_SOURCE_BYTES=2097152;
const TYPES=new Set(['image/png','image/jpeg','image/webp']);
function id(v){if(typeof v!=='string'||!UUID.test(v))throw new CampaignRejected('Identificatore non valido',400);return v;}
function image(type,encoded){
 if(!TYPES.has(type)||typeof encoded!=='string'||encoded.length>699052||
    encoded.length<16||encoded.length%4!==0||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
  throw new CampaignRejected('Immagine non valida',400);
 const b=Buffer.from(encoded,'base64');
 if(b.length<12||b.length>MAX_BYTES||b.toString('base64')!==encoded)
  throw new CampaignRejected('Immagine troppo grande o non valida',400);
 const valid=type==='image/png'?
  b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):
  type==='image/jpeg'?(b[0]===255&&b[1]===216&&b[2]===255):
  b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(!valid)throw new CampaignRejected('Formato immagine non coerente',400);
 return b;
}
export function createCharacterPortraitService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async saveSource(ownerId,campaignId,characterId,body){
   id(ownerId);id(campaignId);id(characterId);
   if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).sort().join(',')!=='campaignId,dataBase64,mimeType'||
      body.campaignId!==campaignId||body.mimeType!=='image/jpeg'||
      typeof body.dataBase64!=='string'||body.dataBase64.length>2796208||
      body.dataBase64.length<16||body.dataBase64.length%4!==0||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64))
     throw new CampaignRejected('Sorgente non valida',400);
   const bytes=Buffer.from(body.dataBase64,'base64');
   if(bytes.length<12||bytes.length>MAX_SOURCE_BYTES||
      bytes.toString('base64')!==body.dataBase64||
      bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)
     throw new CampaignRejected('Sorgente JPEG non valida o troppo grande',400);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.save_owned_character_portrait_source($1,$2,$3,$4,$5) AS saved',
    [ownerId,campaignId,characterId,'image/jpeg',bytes]);
   if(rows[0]?.saved!==true)throw new CampaignRejected('Sorgente non autorizzata',404);
   return {characterId,stored:true};
  },
  async readSource(ownerId,campaignId,characterId){
   id(ownerId);id(campaignId);id(characterId);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.read_owned_character_portrait_source($1,$2,$3)',
    [ownerId,campaignId,characterId]);
   if(!rows[0])throw new CampaignRejected('Sorgente non disponibile',404);
   const record=rows[0];
   if(record.mime_type!=='image/jpeg'||!Buffer.isBuffer(record.bytes)||
      record.bytes.length>MAX_SOURCE_BYTES)throw Error('Corrupt source portrait');
   return {characterId,mimeType:'image/jpeg',dataBase64:record.bytes.toString('base64')};
  },
  async save(ownerId,campaignId,characterId,body){
   id(ownerId);id(campaignId);id(characterId);
   if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).sort().join(',')!=='campaignId,dataBase64,mimeType'||
      body.campaignId!==campaignId)
    throw new CampaignRejected('Dati ritratto non validi',400);
   const binary=image(body.mimeType,body.dataBase64);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.save_owned_character_portrait($1,$2,$3,$4,$5) AS saved',
    [ownerId,campaignId,characterId,body.mimeType,binary]);
   if(rows[0]?.saved!==true)throw new CampaignRejected('Personaggio non autorizzato',404);
   return {characterId,stored:true};
  },
  async read(userId,campaignId,characterId){
   id(userId);id(campaignId);id(characterId);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.read_authorized_character_portrait($1,$2,$3)',
    [userId,campaignId,characterId]);
   const record=rows[0];
   if(!record)throw new CampaignRejected('Immagine non disponibile',404);
   if(!TYPES.has(record.mime_type)||!Buffer.isBuffer(record.bytes)||
       record.bytes.length>MAX_BYTES)throw new Error('Corrupt stored portrait');
   return {characterId,mimeType:record.mime_type,dataBase64:record.bytes.toString('base64')};
  },
 };
}
