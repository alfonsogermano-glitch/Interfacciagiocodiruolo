import assert from 'node:assert/strict';
import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
const theme=read('src/styles/theme.css');
const panel=read('src/app/components/session/dice/SessionDicePanel.tsx');
const button=read('src/app/components/ui/button.tsx');
// Regola universale del sito: ogni controllo non selezionabile mostra il
// simbolo di divieto (cursor: not-allowed), oltre agli effetti grafici.
// Deve stare in theme.css con !important per battere cursor-pointer
// ereditato dalle card e gli inline style cursor:'pointer'.
assert.match(
  theme,
  /button:disabled,\s*input:disabled,\s*select:disabled,\s*textarea:disabled,\s*\[aria-disabled='true'\]\s*\{\s*cursor:\s*not-allowed\s*!important;/,
  'theme.css must declare the universal not-allowed cursor rule for disabled controls',
);
// "Tira" e "Salva formula" del builder devono avere il disabled nativo
// (così li copre la regola universale); "Svuota" si disattiva quando il
// builder e' gia' nelle condizioni iniziali (niente da cancellare) e usa lo
// stesso effetto grafico disabled:opacity-40 degli altri due.
assert.match(panel,/data-dice-roll-builder disabled=\{!validation\.valid\}/,'Tira must be natively disabled when the formula is invalid');
assert.match(panel,/data-dice-save-formula disabled=\{!validation\.valid\|\|saving\}/,'Salva formula must be natively disabled while invalid or saving');
assert.match(panel,/data-dice-clear-builder disabled=\{items\.length===0&&editingId===null&&name===DEFAULT_FORMULA_NAME\}/,'Svuota must be natively disabled when the builder is already empty');
assert.match(panel,/data-dice-clear-builder[^>]*disabled:opacity-40/,'Svuota must share the disabled:opacity-40 effect of Tira and Salva formula');
// Il Button shadcn non deve nascondere il cursore con pointer-events-none
// (il disabled erediterebbe il cursore del genitore, tipicamente manina):
// deve restare colpibile e dichiarare il not-allowed.
assert.doesNotMatch(button,/disabled:pointer-events-none/,'ui Button must stay hit-testable when disabled so the not-allowed cursor shows');
assert.match(button,/disabled:cursor-not-allowed/,'ui Button must declare the not-allowed cursor for its disabled state');
// Le eccezioni cursor-wait (attesa di caricamento) devono usare la variante
// Tailwind "!" (v4: suffisso), sennó la regola globale !important le batte.
for(const file of ['src/app/components/gm/VisualAssetsManager.tsx','src/app/components/session/dice/DiceToolbar.tsx','src/app/components/session/dice/DiceQuickRollFloating.tsx']){
  const source=read(file);
  assert.match(source,/disabled:cursor-wait!/,`${file} must use disabled:cursor-wait! to survive the universal rule`);
  assert.doesNotMatch(source,/disabled:cursor-wait[\s"]/,`${file} must not keep the plain disabled:cursor-wait without the ! suffix`);
}
console.log('Universal disabled not-allowed cursor verification passed.');
