const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createLogicalCharacterCatalogClient(fetchImpl){
 const id=value=>{if(typeof value!=='string'||!UUID.test(value))throw Error('Personaggio non valido');return value;};
 const revision=value=>{if(!Number.isInteger(value)||value<1||value>=2147483647)throw Error('Ricarica il personaggio prima di modificarlo');return value;};
 const base='/vtt/catalog/logical-characters';
 async function request(path='',method='GET',body){
  const response=await fetchImpl(base+path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',
   ...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  if(!response.ok){const error=Error(`Operazione personaggio non riuscita (${response.status}).`);error.status=response.status;throw error;}
  return response.json();
 }
 function checked(character,actor,expectedId,statuses=['active','draft']){
  if(!character||character.logicalOwnerId!==actor||(expectedId!==undefined&&character.id!==expectedId)||
   !statuses.includes(character.status)||!character.sheetData||typeof character.sheetData!=='object'||Array.isArray(character.sheetData))
   throw Error('Risposta catalogo personaggi non coerente');
  id(character.id);id(character.ownerId);revision(character.revision);
  if(character.campaignId!==null)id(character.campaignId);
  return character;
 }
 return {
  async list(actor){
   id(actor);const characters=[],seen=new Set();let cursor=null;
   do{
    const page=await request(cursor?'?after='+id(cursor):'');
    if(!Array.isArray(page.characters)||page.characters.length>100||
     !(page.nextCursor===null||typeof page.nextCursor==='string'))throw Error('Pagina personaggi non valida');
    for(const character of page.characters){
     checked(character,actor);
     if(seen.has(character.id))throw Error('Personaggio duplicato');seen.add(character.id);characters.push(character);
    }
    cursor=page.nextCursor;
    if(cursor!==null&&cursor!==page.characters.at(-1)?.id)throw Error('Cursore personaggi non valido');
   }while(cursor!==null);
   return characters;
  },
  async read(actor,characterId){
   id(actor);id(characterId);
   return checked((await request('/'+characterId)).character,actor,characterId);
  },
  async create(actor,body){
   id(actor);const character=checked((await request('','POST',body)).character,actor);
   if(character.campaignId!==null||character.ownerId!==actor)throw Error('Creazione personaggio non confermata');
   return character;
  },
  async save(actor,characterId,body){
   id(actor);id(characterId);revision(body.revision);
   const character=checked((await request('/'+characterId,'PUT',body)).character,actor,characterId);
   if(character.revision!==body.revision+1)throw Error('Revisione personaggio non confermata');
   return character;
  },
  async archive(actor,characterId,expectedRevision){
   id(actor);id(characterId);revision(expectedRevision);
   const result=await request('/'+characterId,'DELETE',{revision:expectedRevision});
   const character=checked(result.character,actor,characterId,['archived']);
   if(result.archivedId!==characterId||character.revision!==expectedRevision+1)throw Error('Archiviazione personaggio non confermata');
   return character;
  },
  async duplicate(actor,characterId,expectedRevision,requestId){
   id(actor);id(characterId);revision(expectedRevision);id(requestId);
   const character=checked((await request('/'+characterId+'/duplicate','POST',{revision:expectedRevision,requestId})).character,actor);
   if(character.id===characterId||character.claimableOrigin!==false||character.availableForPlayers!==false)
    throw Error('Duplicazione personaggio non confermata');
   return character;
  },
 };
}
