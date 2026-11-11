const RULESETS=new Set(['hsc','dnd5e','pathfinder','coc7e','cocclassic','custom']);
export class CampaignRejected extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
export function createCampaignService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const userId=id=>{
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
   throw new CampaignRejected('Utente non valido',401);
  return id;
 };
 const row=c=>({
  id:c.id,name:c.name,description:c.description,ruleset:c.ruleset,ownerId:c.owner_id,
  createdAt:c.created_at,updatedAt:c.updated_at,lastOpenedAt:c.last_opened_at,
 });
 async function list(ownerId){
  const result=await pool.query('SELECT * FROM hollowgate_vtt.list_owned_campaigns($1)',[userId(ownerId)]);
  return {campaigns:result.rows.map(row)};
 }
 async function create(ownerId,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).some(k=>!['name','description','ruleset'].includes(k))||
   typeof body.name!=='string'||body.name.trim().length<1||body.name.trim().length>100||
   typeof body.description!=='string'||body.description.length>4000||
   typeof body.ruleset!=='string'||!RULESETS.has(body.ruleset))
    throw new CampaignRejected('Dati campagna non validi');
  const id=userId(ownerId);
  const created=await pool.query('SELECT hollowgate_vtt.create_owned_campaign($1,$2,$3,$4) AS id',
    [id,body.name.trim(),body.description,body.ruleset]);
  if(!created.rows[0]?.id)throw new Error('Campaign insert failed');
  const listed=await list(ownerId);
  const campaign=listed.campaigns.find(c=>c.id===created.rows[0].id);
  if(!campaign)throw new Error('Campaign not visible to owner');
  return {campaign};
 }
 return {list,create};
}
