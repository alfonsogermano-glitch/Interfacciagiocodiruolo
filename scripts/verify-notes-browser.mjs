import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NOTE_CASES } from './note-regression-fixtures.mjs';
import { startNoteBrowser, sleep } from './note-browser-driver.mjs';

const browser = await startNoteBrowser();
const { evaluate, cdp, key, click } = browser;
const report = { widths:[1100,360], types:NOTE_CASES.length, documents:0, arrowMoves:0, nativeScenarios:0, archiveTransforms:0, archiveCrud:0, panels:0, richEditorScenarios:0 };
try {
  await evaluate(async () => {
    const {Editor} = await import('/@id/@tiptap/core');
    const {default:StarterKit} = await import('/@id/@tiptap/starter-kit');
    const {default:TaskList} = await import('/@id/@tiptap/extension-task-list');
    const {default:TaskItem} = await import('/@id/@tiptap/extension-task-item');
    const {default:Image} = await import('/@id/@tiptap/extension-image');
    const {TIPTAP_BLOCK_EXTENSIONS} = await import('/src/app/components/session/shared/tiptapBlocks.tsx');
    const {NOTE_TABLE_EXTENSIONS} = await import('/src/app/components/session/shared/tiptapNoteTable.ts');
    const {InlineDice} = await import('/src/app/components/session/shared/tiptapInlineDice.ts');
    const {InlineModifier} = await import('/src/app/components/session/shared/tiptapInlineModifier.ts');
    const {InlinePoints} = await import('/src/app/components/session/shared/tiptapInlinePoints.ts');
    const {InlineCheckbox,InlineRadio} = await import('/src/app/components/session/shared/tiptapInlineCheckbox.ts');
    const {InlineIcon} = await import('/src/app/components/session/shared/tiptapInlineIcon.ts');
    const {Archivio,defaultArchivioCell} = await import('/src/app/components/session/shared/tiptapArchivio.ts');
    const {TextSelection,NodeSelection} = await import('/@id/@tiptap/pm/state');
    const {GapCursor} = await import('/@id/@tiptap/pm/gapcursor');
    const {closeHistory} = await import('/@id/@tiptap/pm/history');
    const {noteCaretStops} = await import('/src/app/components/session/shared/noteCaretNavigation.ts');
    const {noteNeedsTrailingParagraph} = await import('/src/app/components/session/shared/tiptapBlockRow.ts');
    const fixtures = await import('/scripts/note-regression-fixtures.mjs');
    const React = await import('/@id/react'); const RDC = await import('/@id/react-dom/client');
    const {EditorContent} = await import('/@id/@tiptap/react');
    const {AuthProvider} = await import('/src/app/auth/AuthContext.tsx');
    const {CampaignProvider} = await import('/src/app/campaigns/CampaignContext.tsx');
    const {PortalContainerContext} = await import('/src/app/components/ui/portal-container.tsx');
    const {RichTextEditor} = await import('/src/app/components/session/shared/RichTextEditor.tsx');
    const host=document.createElement('div');
    host.style.cssText='position:fixed;top:16px;left:16px;width:1100px;max-height:950px;overflow:auto;padding:16px;z-index:9996;background:#222;color:#ddd;--dash-text:#ddd;--dash-text-strong:#fff;--dash-muted:#aaa;--dash-border:#666;--dash-border-soft:#666;--dash-input:#333;--dash-panel:#252525;--dash-surface:#333;--dash-surface-2:#383838;--dash-accent:#d4aa68;--dash-accent-2:#d4aa68;--dash-danger-border:#f77;--dash-danger-bg:#622;--dash-danger-text:#f99;--note-cell-padding-x:0.5rem;--note-border-width:1px;--note-widget-radius:8px;--note-block-radius:8px;--note-block-padding-x:12px';
    document.body.appendChild(host);
    const ed=new Editor({extensions:[StarterKit.configure({heading:false}),TaskList,TaskItem,Image,...NOTE_TABLE_EXTENSIONS,...TIPTAP_BLOCK_EXTENSIONS,InlineDice,InlineModifier,InlinePoints,InlineCheckbox,InlineRadio,InlineIcon,Archivio],editorProps:{attributes:{class:'tiptap-content'}},content:fixtures.documentFor(['empty'])});
    const h=(React.default||React).createElement;
    const root=(RDC.default||RDC).createRoot(host);
    root.render(h(AuthProvider,null,h(CampaignProvider,null,h(PortalContainerContext.Provider,{value:host},h(EditorContent,{editor:ed})))));
    const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const signature=s=>({pos:s.from,kind:s instanceof GapCursor?'gap':s instanceof NodeSelection?'node':'text'});
    const select=stop=>ed.view.dispatch(ed.state.tr.setSelection(stop.kind==='gap'?new GapCursor(ed.state.doc.resolve(stop.pos)):stop.kind==='node'?NodeSelection.create(ed.state.doc,stop.pos):TextSelection.create(ed.state.doc,stop.pos)).setMeta('blockRowNudge',true));
    const renderRich=width=>{
      host.style.width=`${width}px`;host.style.height='940px';host.scrollTop=0;
      function ControlledNote(){
        const [value,setValue]=(React.default||React).useState(()=>fixtures.documentFor(['dice','points','checkbox','radio','archive','modifier']));
        return h(RichTextEditor,{legacyContent:'',richContent:value,disabled:false,fillViewport:true,
          onChangeRich:next=>{window.__NR.saved=next;setValue(next);}});
      }
      root.render(h(AuthProvider,null,h(CampaignProvider,null,h(PortalContainerContext.Provider,{value:host},h(ControlledNote,{key:`rich-${width}`})))));
    };
    window.__NR={ed,root,host,frame,signature,select,TextSelection,closeHistory,noteCaretStops,noteNeedsTrailingParagraph,fixtures,defaultArchivioCell,renderRich};
  });
  await sleep(400);
  const runDocument = async (names,width,context='root') => evaluate(async (names,width,context) => {
    const n=window.__NR;const {ed,host,fixtures,frame,select,signature,noteCaretStops,noteNeedsTrailingParagraph,closeHistory}=n;
    host.style.width=`${width}px`;host.scrollTop=0;
    let json=fixtures.documentFor(names);
    if(context==='row') json={type:'doc',content:[{type:'blockRow',content:json.content}]};
    if(context==='textBox') json={type:'doc',content:[{type:'textBox',content:json.content}]};
    if(context==='collapse') json={type:'doc',content:[{type:'collapseBlock',attrs:{open:true},content:[{type:'collapseSummary',content:[fixtures.text('titolo')]},{type:'collapseBody',content:json.content}]}]};
    if(context==='table') json={type:'doc',content:[{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:json.content}]}]}]};
    ed.commands.setContent(json);await frame();
    ed.state.doc.check();
    if(noteNeedsTrailingParagraph(ed.state.doc)) throw new Error('No trailing insertion point');
    const stable=JSON.stringify(ed.getJSON());
    const path=noteCaretStops(ed.state.doc);let moves=0;
    ed.view.focus();
    for(const key of ['ArrowRight','ArrowDown','ArrowLeft','ArrowUp']) {
      const ordered=key==='ArrowLeft'||key==='ArrowUp'?[...path].reverse():path;
      select(ordered[0]);
      for(const stop of ordered.slice(1)) {
        ed.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
        if(JSON.stringify(signature(ed.state.selection))!==JSON.stringify(stop)) throw new Error(`${key}: expected ${JSON.stringify(stop)}, got ${JSON.stringify(signature(ed.state.selection))}`);
        moves++;
      }
      ed.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
      if(JSON.stringify(signature(ed.state.selection))!==JSON.stringify(ordered.at(-1))) throw new Error(`${key}: boundary wrapped`);
    }
    if(JSON.stringify(ed.getJSON())!==stable) throw new Error('Arrows changed document content');
    select(path.at(-1));ed.view.dispatch(closeHistory(ed.state.tr));
    ed.commands.insertContent(' PROBE');
    const changed=JSON.stringify(ed.getJSON());
    if(changed===stable) throw new Error('Text insertion did not change the note');
    if(!ed.commands.undo()||JSON.stringify(ed.getJSON())!==stable) throw new Error('Undo lost elements or did not remove the text');
    if(!ed.commands.redo()||JSON.stringify(ed.getJSON())!==changed) throw new Error('Redo failed');
    ed.commands.undo();
    // Reload uses JSON with the real schema, attributes and NodeViews.
    ed.commands.setContent(JSON.parse(stable));await frame();
    if(JSON.stringify(ed.getJSON())!==stable) throw new Error('Save/reload changed the note');
    ed.setEditable(false);
    const before=signature(ed.state.selection);
    ed.view.dom.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    if(JSON.stringify(signature(ed.state.selection))!==JSON.stringify(before)) throw new Error('Read-only editor moved the caret');
    ed.setEditable(true);await frame();
    return {moves};
  },names,width,context);
  if(!process.argv.includes('--archive-only')) for(const width of report.widths) {
    for(const a of NOTE_CASES) {
      try { const r=await runDocument([a],width);report.documents++;report.arrowMoves+=r.moves; }
      catch(error){throw new Error(`single ${a} @${width}: ${error.message}`);}
      for(const b of NOTE_CASES) {
        try {const r=await runDocument([a,b],width);report.documents++;report.arrowMoves+=r.moves;}
        catch(error){throw new Error(`pair ${a}/${b} @${width}: ${error.message}`);}
      }
    }
    const rowCases=NOTE_CASES.filter(name=>['empty','text','dice','modifier','points','checkbox','radio','icon','inlineMixed','textBox','collapseOpen','collapseClosed'].includes(name));
    for(const a of rowCases) for(const b of rowCases) {
      try{const r=await runDocument([a,b],width,'row');report.documents++;report.arrowMoves+=r.moves;}
      catch(error){throw new Error(`row ${a}/${b} @${width}: ${error.message}`);}
    }
    for(const context of ['textBox','collapse','table']) for(const name of NOTE_CASES) {
      if(context==='table' && (name==='table'||name==='archive')) continue; // Both grids are forbidden inside tables.
      try{const r=await runDocument([name],width,context);report.documents++;report.arrowMoves+=r.moves;}
      catch(error){throw new Error(`${context}/${name} @${width}: ${error.message}`);}
    }
    console.log(`PASS browser matrix @${width}: ${report.documents} documents cumulative, ${report.arrowMoves} keyboard-handler moves`);
    // Native Chromium events: unlike dispatchEvent, these exercise default mouse/typing behaviour.
    for(const ending of NOTE_CASES) {
      await runDocument(['dice','points','archive',ending],width);
      const expected=await evaluate(async()=>{
        const {ed,frame,noteCaretStops,select}=window.__NR;
        if(ed.state.doc.lastChild.content.size) ed.commands.insertContentAt(ed.state.doc.content.size,{type:'paragraph'});
        await frame();
        const path=noteCaretStops(ed.state.doc);select(path.at(-2));ed.view.focus();
        return path.at(-1).pos;
      });
      await key('ArrowDown');
      assert.equal(await evaluate('window.__NR.ed.state.selection.from'),expected,`native ArrowDown after ${ending} @${width}`);
      await key('ArrowUp');
      assert.notEqual(await evaluate('window.__NR.ed.state.selection.from'),expected,`native ArrowUp after ${ending}`);
      await key('ArrowRight');
      assert.equal(await evaluate('window.__NR.ed.state.selection.from'),expected,`native ArrowRight after ${ending}`);
      await key('ArrowLeft');
      assert.notEqual(await evaluate('window.__NR.ed.state.selection.from'),expected,`native ArrowLeft after ${ending}`);
      const rect=await evaluate(async()=>{
        const {ed,frame}=window.__NR;const p=ed.view.dom.lastElementChild;p.scrollIntoView({block:'center'});await frame();
        const r=p.getBoundingClientRect();return {x:r.left+8,y:r.top+r.height/2,h:r.height};
      });
      assert.ok(rect.h>0);await click(rect.x,rect.y);
      assert.equal(await evaluate('window.__NR.ed.state.selection.from'),expected,`native mouse after ${ending} @${width}`);
      await cdp.send('Input.insertText',{text:'Nuova riga'});
      assert.equal(await evaluate('window.__NR.ed.state.doc.lastChild.textContent'),'Nuova riga',`native typing after ${ending}`);
      await key('Enter');
      assert.equal(await evaluate('window.__NR.ed.state.doc.lastChild.content.size'),0,`native Enter after ${ending}`);
      report.nativeScenarios++;
    }
  }
  if(report.nativeScenarios) console.log(`PASS native mouse/arrows/typing/Enter: ${report.nativeScenarios} scenarios`);

  const setArchive=async(kind,width=160)=>evaluate(async(kind,width)=>{
    const {ed,host,defaultArchivioCell,frame}=window.__NR;
    host.style.width='1100px';
    ed.commands.setContent({type:'doc',content:[{type:'archivio',attrs:{archiveId:'test-archive',columns:[{id:'name',label:'Nome',width:1000-width},{id:'value',label:'Valore',width}],rows:[{id:'row',cells:[{...defaultArchivioCell('text'),text:'Arco'},defaultArchivioCell(kind)]}]}},{type:'paragraph'}]});await frame();
    // Fixed tables expand undersized colgroups proportionally. Match their
    // actual available width so 130/160/360 are rendered pixels, not just attrs.
    const available=ed.view.dom.querySelector('table').getBoundingClientRect().width;
    const first=ed.state.doc.firstChild;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0,undefined,{...first.attrs,columns:first.attrs.columns.map((column,i)=>({...column,width:i===0?available-width:width}))}).setMeta('addToHistory',false));
    await frame();
    const actual=ed.view.dom.querySelector('tbody td:nth-child(2)').getBoundingClientRect().width;
    if(Math.abs(actual-width)>1)throw new Error(`Expected ${width}px cell, rendered ${actual}px`);
  },kind,width);
  const readCell=()=>evaluate('window.__NR.ed.state.doc.firstChild.attrs.rows[0].cells[1]');
  const openCellMenu=async()=>{
    const point=await evaluate(async()=>{
      const td=window.__NR.ed.view.dom.querySelector('tbody tr td:nth-child(2)');
      td.scrollIntoView({block:'center',inline:'center'});await window.__NR.frame();
      const b=td.querySelector('[data-archivio-trigger]'),r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
    });
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});await sleep(180);
    assert.equal(await evaluate('getComputedStyle(window.__NR.ed.view.dom.querySelector("tbody tr td:nth-child(2) [data-archivio-trigger]")).pointerEvents'),'auto','cell menu must be reachable by mouse');
    await click(point.x,point.y);
    assert.ok(await evaluate('!!document.querySelector("[data-archivio-menu]")'),'native dots click must open cell menu');
  };
  const pick=async label=>{
    assert.ok(await evaluate(label=>{const b=Array.from(document.querySelectorAll('[data-archivio-menu] button')).find(b=>b.getAttribute('aria-label')===label);b?.click();return !!b;},label),`menu action ${label}`);
    await sleep(60);
  };
  const labels={text:'Testo',dice:'Dado',checkbox:'Checkbox',points:'Punti',modifier:'Modificatore'};
  for(const from of Object.keys(labels)) for(const to of Object.keys(labels)) {
    if(from===to)continue;
    await setArchive(from);await openCellMenu();await pick(`Trasforma in ${labels[to]}`);
    assert.equal((await readCell()).kind,to,`${from} → ${to}`);
    const stable=await evaluate('JSON.stringify(window.__NR.ed.getJSON())');
    await evaluate(stable=>window.__NR.ed.commands.setContent(JSON.parse(stable)),stable);
    assert.equal((await readCell()).kind,to,'conversion must persist after reload');report.archiveTransforms++;
  }
  for(const kind of ['dice','modifier']) {
    await setArchive(kind);await openCellMenu();await pick('Modifica');
    const selector=kind==='dice'?'[data-note-dice-menu][role="dialog"]':'[data-note-modifier-edit]';
    assert.ok(await evaluate(selector=>!!document.querySelector(selector),selector),`${kind}: shared edit panel`);
    await evaluate((kind,selector)=>{
      const panel=document.querySelector(selector);
      if(kind==='modifier') {
        const input=panel.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'7');input.dispatchEvent(new Event('input',{bubbles:true}));
        panel.querySelector('[aria-label="Formula"]').textContent='1d6+2';
      }else panel.querySelector('[aria-label="Valore"]').textContent='2d6+1';
    },kind,selector);
    await sleep(50);
    await evaluate(selector=>Array.from(document.querySelectorAll(`${selector} button`)).find(b=>b.textContent.trim()==='Salva').click(),selector);
    await sleep(80);
    const saved=await readCell();assert.equal(saved.text,kind==='dice'?'2d6+1':'7');if(kind==='modifier')assert.equal(saved.formula,'1d6+2');
    await openCellMenu();await pick('Modifica');
    assert.ok(await evaluate(selector=>!!document.querySelector(selector),selector));await key('Escape');
    assert.equal(await evaluate(selector=>!!document.querySelector(selector),selector),false);report.panels++;
  }
  for(const width of [130,160,360]) {
    await setArchive('points',width);
    await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Aumenta Massimo punti"]').click());
    await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Aumenta Valore punti"]').click());
    assert.equal((await readCell()).value,11);assert.equal((await readCell()).max,11);
    await openCellMenu();await pick('Disabilita Massimo');
    assert.equal((await readCell()).maxEnabled,false);
    await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Aumenta Valore punti"]').click());
    assert.equal((await readCell()).value,12,'disabled maximum must not prevent increasing the value');
    const uncapped=await evaluate('JSON.stringify(window.__NR.ed.getJSON())');
    await evaluate(uncapped=>window.__NR.ed.commands.setContent(JSON.parse(uncapped)),uncapped);await sleep(60);
    assert.equal(await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Valore punti"]').value),'12','normalization after reload must preserve an uncapped points value');
    await openCellMenu();await pick('Abilita Massimo');
    const restored=await readCell();assert.ok(restored.value<=restored.max,'re-enabling maximum must restore the clamp');
  }
  await setArchive('checkbox');await openCellMenu();
  await evaluate(()=>document.querySelector('[data-archivio-menu] [aria-label="Aumenta Numero di checkbox"]').click());await sleep(50);
  assert.equal((await readCell()).checkboxCount,2);
  await pick('Modifica');
  const checkboxPanel='[data-archivio-checkbox-menu]';
  assert.ok(await evaluate(selector=>!!document.querySelector(selector),checkboxPanel));
  await evaluate(()=>document.querySelector('[data-archivio-checkbox-menu] [aria-label="Mezzo valore"]').click());
  await evaluate(()=>Array.from(document.querySelectorAll('[data-archivio-checkbox-menu] button')).find(b=>b.textContent.trim()==='Salva').click());await sleep(60);
  assert.equal((await readCell()).checkboxHalf,true);
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('tbody td:nth-child(2) [data-checkbox-state]').click());await sleep(60);
  assert.deepEqual((await readCell()).checkboxStates,[1,0],'half-state change must only affect the clicked checkbox');
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('tbody td:nth-child(2) [data-checkbox-state]').click());await sleep(60);
  assert.deepEqual((await readCell()).checkboxStates,[2,0]);
  await openCellMenu();await pick('Modifica');await key('Escape');
  assert.equal(await evaluate(selector=>!!document.querySelector(selector),checkboxPanel),false);report.panels++;
  await setArchive('modifier');
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Aggiungi riga"]').click());await sleep(60);
  let structure=await evaluate('window.__NR.ed.state.doc.firstChild.attrs');
  assert.equal(structure.rows.length,2);
  assert.equal(structure.rows[1].cells[1].kind,'modifier','new row must copy cell kinds');
  assert.equal(structure.rows[1].cells[1].text,'0','new row must reset values');report.archiveCrud++;
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Menu archivio"]').click());await pick('Aggiungi colonna');
  structure=await evaluate('window.__NR.ed.state.doc.firstChild.attrs');
  assert.equal(structure.columns.length,3);assert.ok(structure.rows.every(row=>row.cells.length===3));report.archiveCrud++;
  for(const kind of ['dice','modifier','checkbox','points','text']) {
    await evaluate(()=>window.__NR.ed.view.dom.querySelector('thead th:nth-child(3) [data-archivio-trigger]').click());
    const convert={dice:'Converti tutto in dadi',modifier:'Converti tutto in Modificatori',checkbox:'Converti tutto in Checkbox',points:'Converti tutto in punti',text:'Converti tutto in testo'};
    await pick(convert[kind]);
    assert.ok((await evaluate('window.__NR.ed.state.doc.firstChild.attrs.rows')).every(row=>row.cells[2].kind===kind),'column conversion must affect every row');report.archiveCrud++;
  }
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Menu archivio"]').click());await pick('Duplica');
  const copies=await evaluate(()=>{const result=[];window.__NR.ed.state.doc.forEach(node=>{if(node.type.name==='archivio')result.push(node.attrs);});return result;});
  assert.equal(copies.length,2);assert.notEqual(copies[0].archiveId,copies[1].archiveId);
  assert.deepEqual(copies[0].rows.map(row=>row.cells.map(cell=>[cell.kind,cell.text,cell.formula])),copies[1].rows.map(row=>row.cells.map(cell=>[cell.kind,cell.text,cell.formula])));
  assert.notEqual(copies[0].rows[0].cells[1].id,copies[1].rows[0].cells[1].id,'duplicate must assign new cell IDs');report.archiveCrud++;
  await evaluate(()=>window.__NR.ed.view.dom.querySelectorAll('[aria-label="Menu archivio"]')[1].click());await pick('Elimina');
  assert.equal(await evaluate(()=>{let count=0;window.__NR.ed.state.doc.forEach(node=>{if(node.type.name==='archivio')count++;});return count;}),1);report.archiveCrud++;
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('thead th:nth-child(3) [data-archivio-trigger]').click());await pick('Cancella colonna');
  structure=await evaluate('window.__NR.ed.state.doc.firstChild.attrs');assert.equal(structure.columns.length,2);assert.ok(structure.rows.every(row=>row.cells.length===2));report.archiveCrud++;
  await evaluate(()=>window.__NR.ed.view.dom.querySelector('[aria-label="Menu riga 2"]').click());await pick('Cancella riga');
  assert.equal((await evaluate('window.__NR.ed.state.doc.firstChild.attrs.rows')).length,1);report.archiveCrud++;
  console.log(`PASS archive: ${report.archiveTransforms} transformations, ${report.panels} shared panels, points with/without maximum`);

  // Actual production component, including read-only activation, controlled
  // richContent feedback, slash menu and standalone contextual menus.
  for(const width of report.widths) {
    await evaluate(width=>window.__NR.renderRich(width),width);await sleep(500);
    const activate=await evaluate(()=>{
      const n=window.__NR;const dom=n.host.querySelector('.tiptap-content');
      if(!dom?.editor)throw new Error('Production editor did not mount');
      n.ed=dom.editor;
      const last=dom.lastElementChild.getBoundingClientRect();
      const shell=dom.closest('[data-note-viewport-fill]');shell.scrollTop=0;
      return {editable:n.ed.isEditable,x:last.left+12,y:last.bottom+16};
    });
    assert.equal(activate.editable,false,'production note must begin read-only');
    await click(activate.x,activate.y);await sleep(300);
    assert.equal(await evaluate('window.__NR.ed.isEditable'),true,'click must activate production editor');
    assert.equal(await evaluate('window.__NR.noteNeedsTrailingParagraph(window.__NR.ed.state.doc)'),false,'activation must repair an existing note without a text tail');
    const point=await evaluate(async()=>{
      const {ed,frame}=window.__NR;ed.view.dom.lastElementChild.scrollIntoView({block:'center'});await frame();
      const r=ed.view.dom.lastElementChild.getBoundingClientRect();return {x:r.left+8,y:r.top+r.height/2};
    });
    await click(point.x,point.y);await cdp.send('Input.insertText',{text:'Test finale'});await sleep(200);
    assert.equal(await evaluate('window.__NR.saved.content.at(-1).content[0].text'),'Test finale','controlled onChange must preserve typing below widgets');
    for(const kind of ['checkbox','radio']) {
      const before=await evaluate('window.__NR.ed.state.selection.from');
      const control=await evaluate(async(kind)=>{
        const b=window.__NR.host.querySelector(`.tiptap-inline-${kind}-widget`);b.scrollIntoView({block:'center'});await window.__NR.frame();
        const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
      },kind);
      await click(control.x,control.y);
      assert.equal(await evaluate('window.__NR.ed.state.selection.from'),before,`${kind} activation must not move the text caret`);
      assert.equal(await evaluate(kind=>{
        let checked=false;window.__NR.ed.state.doc.descendants(node=>{const mark=node.marks.find(mark=>mark.type.name===(kind==='checkbox'?'inlineCheckbox':'inlineRadio'));if(mark)checked=mark.attrs.checked;});return checked;
      },kind),true,`${kind} native click must toggle the real mark`);
    }
    const returnPoint=await evaluate(async()=>{
      const p=window.__NR.ed.view.dom.lastElementChild;p.scrollIntoView({block:'center'});await window.__NR.frame();
      const r=p.getBoundingClientRect();return {x:r.left+8,y:r.top+r.height/2};
    });
    await click(returnPoint.x,returnPoint.y); // Return focus to the final text line before testing the slash menu.
    await key('Enter');await cdp.send('Input.insertText',{text:'/'});await sleep(200);
    assert.ok(await evaluate('!!document.querySelector("[data-note-slash-menu]")'),'slash menu must open on the final text line');
    const before=await evaluate('window.__NR.ed.state.selection.from');await key('ArrowDown');
    assert.equal(await evaluate('window.__NR.ed.state.selection.from'),before,'slash menu must consume arrows without moving the document caret');
    await key('Escape');
    assert.equal(await evaluate('!!document.querySelector("[data-note-slash-menu]")'),false,'Escape must close slash menu');
    // Open the normal Modifier panel from its real widget menu.
    const dot=await evaluate(async()=>{
      const b=window.__NR.host.querySelector('.tiptap-inline-modifier-menu-trigger');b.scrollIntoView({block:'center'});await window.__NR.frame();
      const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
    });
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dot.x,y:dot.y});await sleep(150);await click(dot.x,dot.y);
    assert.ok(await evaluate('!!document.querySelector("[data-note-modifier-menu]")'),'normal modifier menu must open');
    await evaluate(()=>Array.from(document.querySelectorAll('[data-note-modifier-menu] button')).find(b=>b.textContent.trim()==='Modifica').click());await sleep(80);
    assert.ok(await evaluate('!!document.querySelector("[data-note-modifier-edit]")'),'normal modifier must open the same shared panel as the archive');
    await key('Escape');
    assert.equal(await evaluate('!!document.querySelector("[data-note-modifier-edit]")'),false);
    report.richEditorScenarios++;
  }
  console.log(`PASS production RichTextEditor activation, controlled save, slash menu and Modifier panel: ${report.richEditorScenarios} widths`);
  report.status='passed';report.completedAt=new Date().toISOString();
  const artifact=path.join(path.dirname(browser.profile),'notes-regression-report.json');
  await writeFile(artifact,JSON.stringify(report,null,2));
  console.log('PASS notes browser regression',JSON.stringify(report));
  console.log(`Browser report: ${artifact}`);
} catch(error) {
  try {
    const shot=await cdp.send('Page.captureScreenshot',{format:'png'});
    const artifact=path.join(path.dirname(browser.profile),'notes-regression-failure.png');
    await writeFile(artifact,Buffer.from(shot.data,'base64'));
    console.error(`Browser failure screenshot: ${artifact}`);
  }catch{}
  throw error;
} finally { await browser.close(); }
