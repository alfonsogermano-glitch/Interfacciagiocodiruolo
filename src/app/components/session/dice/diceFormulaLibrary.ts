import type { DiceFormulaFolder, DiceLibraryNodeType, SavedCustomDie, SavedDiceFormula } from './diceTypes.ts';
export const MAX_DICE_FORMULA_FOLDER_DEPTH = 5;
export type DiceLibraryNode =
  | { kind:'formula'; id:string; parentId:string|null; sortOrder:number; formula:SavedDiceFormula }
  | { kind:'custom-die'; id:string; parentId:string|null; sortOrder:number; customDie:SavedCustomDie }
  | { kind:'folder'; id:string; parentId:string|null; sortOrder:number; folder:DiceFormulaFolder };
function compareNodes(a:DiceLibraryNode,b:DiceLibraryNode){ if(a.sortOrder!==b.sortOrder)return a.sortOrder-b.sortOrder; if(a.kind!==b.kind)return a.kind.localeCompare(b.kind); return a.id.localeCompare(b.id); }
export function getDiceLibraryNodes(formulas:SavedDiceFormula[],customDice:SavedCustomDie[],folders:DiceFormulaFolder[],parentId:string|null):DiceLibraryNode[]{
  return [
    ...formulas.filter(f=>f.folderId===parentId).map((formula):DiceLibraryNode=>({kind:'formula',id:formula.id,parentId:formula.folderId,sortOrder:formula.sortOrder,formula})),
    ...customDice.filter(d=>d.folderId===parentId).map((customDie):DiceLibraryNode=>({kind:'custom-die',id:customDie.id,parentId:customDie.folderId,sortOrder:customDie.sortOrder,customDie})),
    ...folders.filter(f=>f.parentFolderId===parentId).map((folder):DiceLibraryNode=>({kind:'folder',id:folder.id,parentId:folder.parentFolderId,sortOrder:folder.sortOrder,folder})),
  ].sort(compareNodes);
}
export function getDiceFormulaFolderDepth(folderId:string,folders:DiceFormulaFolder[]):number{const byId=new Map(folders.map(f=>[f.id,f]));const seen=new Set<string>();let current=byId.get(folderId);let depth=0;while(current){if(seen.has(current.id))return MAX_DICE_FORMULA_FOLDER_DEPTH+1;seen.add(current.id);depth++;current=current.parentFolderId?byId.get(current.parentFolderId):undefined;}return depth;}
export function getDiceFormulaFolderSubtreeHeight(folderId:string,folders:DiceFormulaFolder[]):number{const children=new Map<string,string[]>();for(const f of folders){if(!f.parentFolderId)continue;const list=children.get(f.parentFolderId)??[];list.push(f.id);children.set(f.parentFolderId,list);}const visit=(id:string,seen:Set<string>):number=>{if(seen.has(id))return MAX_DICE_FORMULA_FOLDER_DEPTH+1;const next=new Set(seen);next.add(id);const nested=children.get(id)??[];return nested.length===0?1:1+Math.max(...nested.map(c=>visit(c,next)));};return visit(folderId,new Set());}
export function canMoveDiceFormulaFolder(folderId:string,destinationParentId:string|null,folders:DiceFormulaFolder[]):boolean{if(destinationParentId===folderId)return false;const byId=new Map(folders.map(f=>[f.id,f]));let currentId=destinationParentId;const seen=new Set<string>();while(currentId){if(currentId===folderId||seen.has(currentId))return false;seen.add(currentId);currentId=byId.get(currentId)?.parentFolderId??null;}const depth=destinationParentId?getDiceFormulaFolderDepth(destinationParentId,folders):0;return depth+getDiceFormulaFolderSubtreeHeight(folderId,folders)<=MAX_DICE_FORMULA_FOLDER_DEPTH;}
function normalizeLevel(formulas:SavedDiceFormula[],customDice:SavedCustomDie[],folders:DiceFormulaFolder[],parentId:string|null){getDiceLibraryNodes(formulas,customDice,folders,parentId).forEach((node,index)=>{if(node.kind==='formula'){const x=formulas.find(v=>v.id===node.id);if(x)x.sortOrder=index;}else if(node.kind==='custom-die'){const x=customDice.find(v=>v.id===node.id);if(x)x.sortOrder=index;}else{const x=folders.find(v=>v.id===node.id);if(x)x.sortOrder=index;}});}
export function applyDiceLibraryMove(formulas:SavedDiceFormula[],customDice:SavedCustomDie[],folders:DiceFormulaFolder[],nodeType:DiceLibraryNodeType,nodeId:string,destinationParentId:string|null,destinationIndex:number){
 const nextFormulas=formulas.map(x=>({...x}));const nextCustomDice=customDice.map(x=>({...x}));const nextFolders=folders.map(x=>({...x}));
 const sourceParentId=nodeType==='formula'?nextFormulas.find(x=>x.id===nodeId)?.folderId:nodeType==='custom-die'?nextCustomDice.find(x=>x.id===nodeId)?.folderId:nextFolders.find(x=>x.id===nodeId)?.parentFolderId;
 if(sourceParentId===undefined)return{formulas:nextFormulas,customDice:nextCustomDice,folders:nextFolders};
 if(nodeType==='formula'){const x=nextFormulas.find(v=>v.id===nodeId);if(x){x.folderId=destinationParentId;x.sortOrder=Number.MAX_SAFE_INTEGER;}}
 else if(nodeType==='custom-die'){const x=nextCustomDice.find(v=>v.id===nodeId);if(x){x.folderId=destinationParentId;x.sortOrder=Number.MAX_SAFE_INTEGER;}}
 else{const x=nextFolders.find(v=>v.id===nodeId);if(x){x.parentFolderId=destinationParentId;x.sortOrder=Number.MAX_SAFE_INTEGER;}}
 if(sourceParentId!==destinationParentId)normalizeLevel(nextFormulas,nextCustomDice,nextFolders,sourceParentId);
 const nodes=getDiceLibraryNodes(nextFormulas,nextCustomDice,nextFolders,destinationParentId).filter(n=>!(n.kind===nodeType&&n.id===nodeId));
 const insertAt=Math.max(0,Math.min(destinationIndex,nodes.length));
 let moved:DiceLibraryNode|undefined;
 if(nodeType==='formula'){const x=nextFormulas.find(v=>v.id===nodeId);if(x)moved={kind:'formula',id:x.id,parentId:destinationParentId,sortOrder:insertAt,formula:x};}
 else if(nodeType==='custom-die'){const x=nextCustomDice.find(v=>v.id===nodeId);if(x)moved={kind:'custom-die',id:x.id,parentId:destinationParentId,sortOrder:insertAt,customDie:x};}
 else{const x=nextFolders.find(v=>v.id===nodeId);if(x)moved={kind:'folder',id:x.id,parentId:destinationParentId,sortOrder:insertAt,folder:x};}
 if(moved)nodes.splice(insertAt,0,moved);
 nodes.forEach((node,index)=>{if(node.kind==='formula'){const x=nextFormulas.find(v=>v.id===node.id);if(x)x.sortOrder=index;}else if(node.kind==='custom-die'){const x=nextCustomDice.find(v=>v.id===node.id);if(x)x.sortOrder=index;}else{const x=nextFolders.find(v=>v.id===node.id);if(x)x.sortOrder=index;}});
 return{formulas:nextFormulas,customDice:nextCustomDice,folders:nextFolders};
}
export function getDiceFormulaFolderDirectContentCount(folderId:string,formulas:SavedDiceFormula[],customDice:SavedCustomDie[],folders:DiceFormulaFolder[]):number{return formulas.filter(f=>f.folderId===folderId).length+customDice.filter(d=>d.folderId===folderId).length+folders.filter(f=>f.parentFolderId===folderId).length;}
