// Original CampaignHome groups cards by the SERVER-VERIFIED assigned player.
// The GM retains ownership of every sheet, including when its card is shown
// beneath a player. The assignment map is never inferred from names or roles.
export function composeOwnedCampaignPlayerRows(members,characters,ownerId,assignments=new Map()){
 if(!Array.isArray(members)||!Array.isArray(characters)||
    typeof ownerId!=='string'||members.length>101||characters.length>100||
    !(assignments instanceof Map)||assignments.size>100)
  throw new Error('Elenco campagna non valido');
 const seen=new Set();
 const rows=members.map(m=>{
  if(!m||typeof m.userId!=='string'||seen.has(m.userId)||
     !['gm','player'].includes(m.role)||typeof m.displayName!=='string'||
     !m.displayName.trim())throw new Error('Partecipante non valido');
  seen.add(m.userId);
  return {userId:m.userId,displayName:m.displayName,role:m.role,characters:[]};
 });
 const ownerRows=rows.filter(m=>m.userId===ownerId&&m.role==='gm');
 if(ownerRows.length!==1)throw new Error('GM della campagna non verificato');
 const playerRows=new Map(rows.filter(r=>r.role==='player').map(r=>[r.userId,r]));
 const charIds=new Set();
 for(const character of characters){
  if(!character||character.ownerId!==ownerId||typeof character.id!=='string'||
     charIds.has(character.id)||typeof character.name!=='string'||!character.sheetData||
     typeof character.sheetData!=='object'||Array.isArray(character.sheetData))
   throw new Error('Proprietà del personaggio non verificata');
  charIds.add(character.id);
  if(character.status==='active'){
   const playerId=assignments.get(character.id);
   if(playerId!==undefined&&!playerRows.has(playerId))
    throw new Error('Assegnazione a un membro non autorizzato');
   (playerId===undefined?ownerRows[0]:playerRows.get(playerId)).characters.push(character);
  }else if(character.status!=='draft'||assignments.has(character.id))
   throw new Error('Stato personaggio o assegnazione non valido');
 }
 for(const [characterId,playerId] of assignments){
  if(!charIds.has(characterId)||!playerRows.has(playerId))
   throw new Error('Assegnazione non verificata');
 }
 return rows;
}
