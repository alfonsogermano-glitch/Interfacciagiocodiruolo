// Transport-only fixes for the isolated original UI. Fail on upstream drift.
// Original sources remain unchanged; production does not include this component.
export function acknowledgeOriginalCatalogCreation(input){
 let code=input.replace(/\r\n/g,'\n');
 function once(from,to){
  if(code.split(from).length!==2)throw Error('Original catalog creation contract changed');
  code=code.replace(from,to);
 }
 once('const [draftNpc, setDraftNpc] = useState<NPC | null>(null);',
  `const [draftNpc, setDraftNpc] = useState<NPC | null>(null);
  const catalogCreationLockRef = useRef(false);
  const [catalogCreating, setCatalogCreating] = useState(false);`);
 for(const {type,label,draft,list,save,oldCall} of [
  {type:'npc',label:'Npc',draft:'draftNpc',list:'Npcs',save:'saveNPC',
   oldCall:"saveNPC(draftNpc.campaignId ?? null, draftNpc).catch(err => console.error('Errore salvataggio PNG:', err));"},
  {type:'monster',label:'Monster',draft:'draftMonster',list:'Monsters',save:'saveMonster',
   oldCall:"saveMonster(draftMonster.campaignId, draftMonster).catch(err => console.error('Errore salvataggio mostro:', err));"},
 ]){
  once(`const handleConfirmCreate${label} = () => {
    if (!${draft} || !${draft}.name.trim()) return;

    setDraft${label}(null);
    set${list}(prev => [...prev, ${draft}]);
    ${oldCall}
  };`,
  `const handleConfirmCreate${label} = async () => {
    if (!${draft} || !${draft}.name.trim() || catalogCreationLockRef.current) return;
    catalogCreationLockRef.current = true;
    setCatalogCreating(true);
    try {
      const saved = await ${save}(${draft}.campaignId ?? null, ${draft});
      set${list}(prev => [...prev, saved]);
      setDraft${label}(null);
      onOpenDetail('${type}', saved.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Creazione non riuscita: la bozza è conservata.');
    } finally {
      catalogCreationLockRef.current = false;
      setCatalogCreating(false);
    }
  };`);
 }
 once('const handleCloseDetail = () => {','const handleCloseDetail = () => {\n    if (catalogCreationLockRef.current) return;');
 once('disabled={!detailData.name.trim()}','disabled={catalogCreating || !detailData.name.trim()}');
 once('onUpdate={(updated) => {','onUpdate={(updated) => {\n                if (catalogCreationLockRef.current) return;');
 once("console.error('Errore salvataggio personaggio su Supabase:', error);",
  "showToast(error instanceof Error ? error.message : 'Scheda non salvata: ricarica prima di riprovare.');");
 once("saveNPC(updated.campaignId ?? '', updated as NPC).catch(err => console.error('Errore salvataggio PNG:', err));",
  "saveNPC(updated.campaignId ?? '', updated as NPC).catch(err => showToast(err instanceof Error ? err.message : 'PNG non salvato.'));");
 once("saveMonster(updated.campaignId ?? '', updated as Monster).catch(err => console.error('Errore salvataggio mostro:', err));",
  "saveMonster(updated.campaignId ?? '', updated as Monster).catch(err => showToast(err instanceof Error ? err.message : 'Mostro non salvato.'));");
 return code;
}
