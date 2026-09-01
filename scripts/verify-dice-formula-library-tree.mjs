import assert from 'node:assert/strict';import fs from 'node:fs';const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const types=read('src/app/components/session/dice/diceTypes.ts'),lib=read('src/app/components/session/dice/diceFormulaLibrary.ts'),tree=read('src/app/components/session/dice/DiceFormulaLibraryTree.tsx'),panel=read('src/app/components/session/dice/SessionDicePanel.tsx'),folder=read('src/app/components/session/dice/DiceFormulaFolderRow.tsx'),dialog=read('src/app/components/session/dice/DeleteDiceFormulaFolderDialog.tsx'),custom=read('src/app/components/session/dice/SavedCustomDieCard.tsx'),migration=read('supabase/migrations/20260831203000_custom_dice_and_library_nodes.sql');
assert.ok(types.includes("'formula' | 'custom-die' | 'folder'"));assert.ok(lib.includes('MAX_DICE_FORMULA_FOLDER_DEPTH = 5'));assert.ok(lib.includes('canMoveDiceFormulaFolder'));assert.ok(lib.includes('customDice'));
for(const hook of ['data-dice-formula-library-tree','dice-formula-folders:${campaignId}:${userId}','AUTO_OPEN_DELAY=650','data-dice-library-root-drop','setDragImage','data-dice-library-drag-ghost']) assert.ok(tree.includes(hook),`tree missing ${hook}`);
for(const text of ['Nuova sottocartella','Rinomina','Icona','Elimina']) assert.ok(folder.includes(text));
assert.ok(dialog.includes('Elimina anche tutto il contenuto della cartella'));assert.ok(custom.includes('data-saved-custom-die'));
assert.ok(panel.includes('setCustomDice(previousCustomDice)'));assert.ok(panel.includes('getDiceFormulaFolderDirectContentCount'));assert.ok(panel.includes('applyDiceLibraryMove'));
assert.ok(migration.includes("'custom-die'::text"));assert.ok(migration.includes('public.dice_custom_dice'));
console.log('Dice formula library tree verification passed.');
