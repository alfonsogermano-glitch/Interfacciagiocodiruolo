// Original CampaignHome groups character cards by the actual owner profile.
// Aruba has only GM-owned character drafts today. Never infer a player
// assignment from a campaign membership or from matching display names.
export function composeOwnedCampaignPlayerRows(members,characters,ownerId){
 if(!Array.isArray(members)||!Array.isArray(characters)||
    typeof ownerId!=='string'||members.length>101||characters.length>100)
  throw new Error('Elenco campagna non valido');
 const seen=new Set();
 const rows=members.map(m=>{
  if(!m||typeof m.userId!=='string'||seen.has(m.userId)||
     !['gm','player'].includes(m.role)||typeof m.displayName!=='string'||
     !m.displayName.trim())throw new Error('Partecipante non valido');
  seen.add(m.userId);
  return {userId:m.userId,displayName:m.displayName,role:m.role,characters:[]};
 });
 const owners=rows.filter(m=>m.userId===ownerId&&m.role==='gm');
 if(owners.length!==1)throw new Error('GM della campagna non verificato');
 for(const character of characters){
  if(!character||character.ownerId!==ownerId||typeof character.id!=='string'||
     typeof character.name!=='string'||!character.sheetData||
     typeof character.sheetData!=='object'||Array.isArray(character.sheetData))
   throw new Error('Proprietà del personaggio non verificata');
  if(character.status==='active')owners[0].characters.push(character);
  else if(character.status!=='draft')throw new Error('Stato personaggio non valido');
 }
 return rows;
}
