# Note Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add responsive 3×3 rich-text tables to Hollowgate Notes with a right-side contextual toolbar, controlled one-level block nesting, paragraph-level alignment, and cross-Note/browser-tab clipboard copy/paste.

**Architecture:** Use TipTap `TableKit` 3.29.1 for table structure and native row/column/header commands, but replace the default cell/header nodes with Hollowgate variants whose content expression excludes nested tables while allowing the editor’s existing block types. Keep table selection/guard logic in a focused TipTap extension, clipboard serialization in a dedicated module, and the floating contextual controls in a separate React component so `RichTextEditor.tsx` only wires them together.

**Tech Stack:** React 18.3.1, TypeScript 5.7.3, TipTap 3.29.1, ProseMirror via `@tiptap/pm`, Lucide React 0.487.0, Tailwind/CSS dashboard palette variables, Vite 6.4.3.

**Spec:** `docs/superpowers/specs/2026-08-23-note-tables-design.md`

## Global Constraints

- Default insertion is exactly 3 rows × 3 columns with `withHeaderRow: false`; no selector or setup dialog.
- Tables use `width: 100%`; no manual column resize in this version.
- Context toolbar appears only while an editable selection is inside a table and contains exactly the 10 approved actions.
- A table may never be nested inside another table, TextBox, or CollapseBlock.
- A TextBox or CollapseBlock may be a direct child of a table cell; existing guards continue to forbid TextBox/Collapse inside TextBox/Collapse.
- Text alignment remains paragraph-scoped, so paragraphs in the same cell can have independent left/center/right alignment.
- Copy uses the system/browser clipboard and must work across Notes and Hollowgate browser tabs/windows.
- Clipboard always writes `text/html` and `text/plain`; structured Hollowgate JSON is additional and must not be the only representation.
- No database, Supabase schema, RLS, Storage, server API, or global presence changes.
- PR #9 (`ui/note-horizontal-rule-minus`) remains independent. Do not cherry-pick or merge it into this feature branch unless it has already landed on `main` through its own explicit approval path.
- No merge to `main` without explicit user approval.

---

## File Structure

- Create `src/app/components/session/shared/tiptapNoteTable.ts`
  - Owns TableKit configuration, restricted cell/header nodes, active-table lookup, insertion guard, nested-table paste/drop guard, and `insertNoteTable()` command.
- Create `src/app/components/session/shared/noteTableClipboard.ts`
  - Owns structured payload encoding/decoding, plain-text representation, static HTML serialization, clipboard write, and structured paste extraction.
- Create `src/app/components/session/shared/NoteTableToolbar.tsx`
  - Owns active-table tracking, viewport positioning, the 10 icon buttons, command enabled states, and clipboard-copy feedback.
- Modify `src/app/components/session/shared/RichTextEditor.tsx`
  - Registers the table extensions, adds the `Table2` button to **Blocchi**, mounts `NoteTableToolbar`, and preserves paragraph-scoped TextAlign.
- Modify `src/styles/theme.css`
  - Adds table/cell/header/selection styling using only `--dash-*` variables.
- Create `scripts/verify-note-tables.mjs`
  - Focused verifier for schema, source integration, clipboard helpers, toolbar action contract, and nesting rules.
- Modify `package.json`
  - Adds `verify:note-tables` and inserts it into `npm run check`.

---

### Task 1: Table schema, insertion command, and nesting guard

**Files:**
- Create: `src/app/components/session/shared/tiptapNoteTable.ts`
- Create: `scripts/verify-note-tables.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `NOTE_TABLE_CELL_CONTENT: string`
- Produces: `NOTE_TABLE_EXTENSIONS: Extensions`
- Produces: `findActiveTable(state: EditorState): { node: PMNode; pos: number; depth: number } | null`
- Produces command: `insertNoteTable(): boolean`
- Produces: `sliceContainsTable(slice: Slice): boolean`

- [ ] **Step 1: Write the failing verifier**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapNoteTable.ts');
} catch (error) {
  assert.fail(`Note table core not implemented: ${error?.message ?? error}`);
}

const { NOTE_TABLE_CELL_CONTENT, NOTE_TABLE_EXTENSIONS, sliceContainsTable } = feature;
assert.ok(NOTE_TABLE_EXTENSIONS?.length >= 3, 'table extensions must be exported');
assert.match(NOTE_TABLE_CELL_CONTENT, /textBox/);
assert.match(NOTE_TABLE_CELL_CONTENT, /collapseBlock/);
assert.doesNotMatch(NOTE_TABLE_CELL_CONTENT, /\btable\b/, 'cell schema must exclude nested tables');
assert.equal(typeof sliceContainsTable, 'function');

const source = await readFile(new URL('../src/app/components/session/shared/tiptapNoteTable.ts', import.meta.url), 'utf8');
assert.match(source, /insertTable\(\{\s*rows:\s*3,\s*cols:\s*3,\s*withHeaderRow:\s*false\s*\}\)/s);
assert.match(source, /isSelectionInside\(state, 'table'\)/);
assert.match(source, /handlePaste/);
assert.match(source, /handleDrop/);
```

- [ ] **Step 2: Wire the verifier into `package.json` and run RED**

```json
"verify:note-tables": "node --experimental-strip-types scripts/verify-note-tables.mjs",
"check": "npm run typecheck && npm run verify:campaign-canonical && npm run verify:note-inline-checkbox && npm run verify:note-tables && npm run build"
```

Run: `npm run verify:note-tables`

Expected: FAIL because `tiptapNoteTable.ts` does not exist.

- [ ] **Step 3: Implement the restricted table core**

```ts
import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Slice } from '@tiptap/pm/model';

export const NOTE_TABLE_CELL_CONTENT = '(paragraph | bulletList | orderedList | blockquote | horizontalRule | image | taskList | textBox | collapseBlock)+';

export const HollowgateTableCell = TableCell.extend({ content: NOTE_TABLE_CELL_CONTENT });
export const HollowgateTableHeader = TableHeader.extend({ content: NOTE_TABLE_CELL_CONTENT });

function isSelectionInside(state: EditorState, typeName: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return true;
  }
  return false;
}

export const NoteTableCommands = Extension.create({
  name: 'noteTableCommands',
  addCommands() {
    return {
      insertNoteTable:
        () =>
        ({ commands, state }) => {
          if (isSelectionInside(state, 'table') || isSelectionInside(state, 'textBox') || isSelectionInside(state, 'collapseBody') || isSelectionInside(state, 'collapseSummary')) return false;
          return commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
        },
    };
  },
});

export const NOTE_TABLE_EXTENSIONS: Extensions = [
  TableKit.configure({ table: { resizable: false, HTMLAttributes: { class: 'tiptap-note-table' } }, tableCell: false, tableHeader: false }),
  HollowgateTableCell.configure({ HTMLAttributes: { class: 'tiptap-note-table-cell' } }),
  HollowgateTableHeader.configure({ HTMLAttributes: { class: 'tiptap-note-table-header' } }),
  NoteTableCommands,
];
```

Add a ProseMirror plugin in `NoteTableCommands` that consumes paste/drop of a Slice containing a table when the destination is already inside a table; the schema itself remains the primary invariant because the custom cell/header content does not include `table`.

- [ ] **Step 4: Run GREEN**

Run: `npm run verify:note-tables && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-note-tables.mjs src/app/components/session/shared/tiptapNoteTable.ts
git commit -m "feat: add note table schema and nesting guards"
```

---

### Task 2: Cross-Note/browser-tab clipboard format

**Files:**
- Create: `src/app/components/session/shared/noteTableClipboard.ts`
- Modify: `scripts/verify-note-tables.mjs`

**Interfaces:**
- Produces: `HOLLOWGATE_TABLE_MIME = 'web application/x-hollowgate-table+json'`
- Produces: `encodeTablePayload(json: JSONContent): string`
- Produces: `decodeTablePayload(encoded: string): JSONContent | null`
- Produces: `tableJSONToPlainText(json: JSONContent): string`
- Produces: `embedTablePayloadInHtml(html: string, json: JSONContent): string`
- Produces: `extractTablePayloadFromHtml(html: string): JSONContent | null`
- Produces: `writeTableToClipboard(editor: Editor, tableNode: PMNode): Promise<void>`

- [ ] **Step 1: Extend verifier with RED clipboard tests**

```js
const clipboard = await import('../src/app/components/session/shared/noteTableClipboard.ts');
const sample = {
  type: 'table',
  content: [
    { type: 'tableRow', content: [
      { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nome' }] }] },
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valore' }] }] },
    ] },
  ],
};
const encoded = clipboard.encodeTablePayload(sample);
assert.deepEqual(clipboard.decodeTablePayload(encoded), sample);
assert.equal(clipboard.tableJSONToPlainText(sample), 'Nome\tValore');
const marked = clipboard.embedTablePayloadInHtml('<table><tr><th>Nome</th><td>Valore</td></tr></table>', sample);
assert.deepEqual(clipboard.extractTablePayloadFromHtml(marked), sample);
assert.match(clipboard.HOLLOWGATE_TABLE_MIME, /^web application\//);
```

Run: `npm run verify:note-tables`

Expected: FAIL because clipboard module does not exist.

- [ ] **Step 2: Implement UTF-8-safe structured marker and plain text**

Use `TextEncoder`/`TextDecoder` plus `btoa`/`atob` for the marker. Wrap static table HTML as:

```html
<div data-hollowgate-table-clipboard="1" data-hollowgate-table-json="BASE64_UTF8">…table html…</div>
```

`tableJSONToPlainText()` iterates rows and joins cell text with `\t`, rows with `\n`.

- [ ] **Step 3: Implement system clipboard write**

Use `DOMSerializer.fromSchema(editor.schema).serializeNode(tableNode, { document })` to create clean static HTML from schema rendering rather than cloning the live NodeView DOM. Always create `text/html` and `text/plain` blobs. Add the custom `web application/x-hollowgate-table+json` blob only when `ClipboardItem.supports?.(HOLLOWGATE_TABLE_MIME)` is true. Call `navigator.clipboard.write([new ClipboardItem(data)])` from the user-triggered toolbar click.

- [ ] **Step 4: Run GREEN**

Run: `npm run verify:note-tables && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-note-tables.mjs src/app/components/session/shared/noteTableClipboard.ts
git commit -m "feat: add portable note table clipboard format"
```

---

### Task 3: Contextual table toolbar

**Files:**
- Create: `src/app/components/session/shared/NoteTableToolbar.tsx`
- Modify: `scripts/verify-note-tables.mjs`

**Interfaces:**
- Consumes: `findActiveTable`, `writeTableToClipboard`
- Produces React component: `NoteTableToolbar({ editor, editable }: { editor: Editor; editable: boolean })`

- [ ] **Step 1: Add RED source-contract tests for all ten actions**

```js
const toolbarSource = await readFile(new URL('../src/app/components/session/shared/NoteTableToolbar.tsx', import.meta.url), 'utf8');
for (const command of [
  'addRowBefore', 'addRowAfter', 'addColumnBefore', 'addColumnAfter',
  'toggleHeaderRow', 'toggleHeaderColumn', 'deleteRow', 'deleteColumn', 'deleteTable',
]) assert.match(toolbarSource, new RegExp(command));
assert.match(toolbarSource, /writeTableToClipboard/);
assert.match(toolbarSource, /editable/);
assert.match(toolbarSource, /selectionUpdate/);
assert.match(toolbarSource, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/);
```

Run: `npm run verify:note-tables`

Expected: FAIL because toolbar component does not exist.

- [ ] **Step 2: Implement active-table tracking and fixed viewport positioning**

Subscribe to TipTap `selectionUpdate` and `transaction`. Resolve the table via `findActiveTable(editor.state)`, call `editor.view.nodeDOM(pos)` and `getBoundingClientRect()`, then render the toolbar as `position: fixed` at `tableRect.right + 8` and `tableRect.top`. Recompute on window resize/scroll; clamp horizontally so controls remain reachable on narrow screens.

- [ ] **Step 3: Implement exactly ten icon-only controls**

Use Lucide icons and existing `Tooltip`. Each mutating button uses `editor.can()` to determine disabled state and invokes `editor.chain().focus().<command>().run()`. `Copy table` uses the active table node and `writeTableToClipboard()`. On clipboard failure show `window.alert('Impossibile copiare la tabella negli appunti.')`; do not mutate document state.

- [ ] **Step 4: Run GREEN**

Run: `npm run verify:note-tables && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-note-tables.mjs src/app/components/session/shared/NoteTableToolbar.tsx
git commit -m "feat: add contextual note table toolbar"
```

---

### Task 4: Editor integration, structured paste, and paragraph alignment

**Files:**
- Modify: `src/app/components/session/shared/RichTextEditor.tsx`
- Modify: `src/app/components/session/shared/tiptapNoteTable.ts`
- Modify: `scripts/verify-note-tables.mjs`

**Interfaces:**
- Consumes: `NOTE_TABLE_EXTENSIONS`, `NoteTableToolbar`, `extractTablePayloadFromHtml`

- [ ] **Step 1: Add RED integration assertions**

```js
const editorSource = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
assert.match(editorSource, /Table2/);
assert.match(editorSource, /insertNoteTable\(\)/);
assert.match(editorSource, /\.\.\.NOTE_TABLE_EXTENSIONS/);
assert.match(editorSource, /<NoteTableToolbar editor=\{editor\} editable=\{editable\}/);
assert.match(editorSource, /TextAlign\.configure\(\{ types: \['paragraph'\] \}\)/);
```

Run: `npm run verify:note-tables`

Expected: FAIL because editor integration is absent.

- [ ] **Step 2: Add the toolbar insertion button and register extensions**

In **Blocchi** add:

```tsx
<ToolbarButton
  disabled={!editable || editor.isActive('table')}
  label="Tabella"
  active={false}
  onClick={() => runCommand(() => editor.chain().focus().insertNoteTable().run())}
>
  <Table2 className="h-4 w-4" />
</ToolbarButton>
```

Register `...NOTE_TABLE_EXTENSIONS` after existing custom block/inline extensions in the TipTap extension list.

- [ ] **Step 3: Mount the contextual toolbar next to EditorContent**

Render `NoteTableToolbar` from `TipTapEditor` only through its own `editable` check; do not persist toolbar state in document JSON.

- [ ] **Step 4: Prefer structured Hollowgate paste outside tables**

In the table extension `handlePaste`, read `event.clipboardData?.getData('text/html')`. If it contains a valid Hollowgate marker and the current selection is not inside table/TextBox/Collapse, decode JSON, create a schema node, call `node.check()`, then insert it as a Slice through the current transaction. If the selection is inside a table and incoming content contains a table, consume the event without mutation. If structured payload is invalid, return `false` so native HTML/plain paste remains available.

- [ ] **Step 5: Run GREEN**

Run: `npm run verify:note-tables && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-note-tables.mjs src/app/components/session/shared/RichTextEditor.tsx src/app/components/session/shared/tiptapNoteTable.ts
git commit -m "feat: integrate tables into note editor"
```

---

### Task 5: Responsive palette-aware table styling

**Files:**
- Modify: `src/styles/theme.css`
- Modify: `scripts/verify-note-tables.mjs`

- [ ] **Step 1: Add RED CSS assertions**

```js
const css = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
assert.match(css, /\.tiptap-content table\.tiptap-note-table[\s\S]*width:\s*100%/);
assert.match(css, /border:\s*1px solid var\(--dash-border-soft\)/);
assert.match(css, /\.tiptap-note-table-header[\s\S]*var\(--dash-surface-2\)/);
assert.doesNotMatch(css.match(/\/\* Note tables \*\/[\s\S]*$/)?.[0] ?? '', /#[0-9a-f]{3,8}/i);
```

Run: `npm run verify:note-tables`

Expected: FAIL until styling exists.

- [ ] **Step 2: Add scoped Note table CSS**

```css
/* Note tables */
.tiptap-content table.tiptap-note-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  color: var(--dash-text);
}
.tiptap-content .tiptap-note-table-cell,
.tiptap-content .tiptap-note-table-header {
  min-width: 3rem;
  padding: 0.4rem 0.5rem;
  vertical-align: top;
  border: 1px solid var(--dash-border-soft);
}
.tiptap-content .tiptap-note-table-header {
  background: var(--dash-surface-2);
  color: var(--dash-text-strong);
  font-weight: 600;
}
.tiptap-content .tiptap-note-table-cell > *:last-child,
.tiptap-content .tiptap-note-table-header > *:last-child {
  margin-bottom: 0;
}
```

If content needs more width than the editor, keep the existing `.tiptap-content` horizontal overflow behavior rather than adding a second nested scrollbar.

- [ ] **Step 3: Run GREEN**

Run: `npm run verify:note-tables && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-note-tables.mjs src/styles/theme.css
git commit -m "style: add responsive palette-aware note tables"
```

---

### Task 6: Full regression gate and preview smoke

**Files:**
- Review all files changed by Tasks 1–5.
- Update PR body only; no production behavior changes unless a failing gate proves one is required.

- [ ] **Step 1: Run the complete local/CI-equivalent gate**

```bash
npm ci
npm audit --audit-level=high
npm run check
```

Expected: 0 vulnerabilities; TypeScript PASS; canonical campaign PASS; inline checkbox verifier PASS; note-table verifier PASS; production build PASS.

- [ ] **Step 2: Review diff for unrelated churn**

Confirm `RichTextEditor.tsx` changes are limited to imports, Table button, extension registration, and contextual toolbar mount. Confirm no DB/Supabase/RLS/presence files changed.

- [ ] **Step 3: Create/update draft PR**

PR title: `Note: rich tables with contextual controls`

PR body must record RED/GREEN runs, exact final HEAD, CI result, Vercel result, changed-file scope, and explicit statement that merge requires user approval.

- [ ] **Step 4: Vercel authenticated smoke**

Verify in preview:

1. One click inserts 3×3 with no header.
2. Table width follows Note width.
3. Context toolbar appears only with cursor inside the table.
4. All row/column/header/delete operations target the current cursor row/column.
5. Copy/paste works into another Note and another Hollowgate browser tab.
6. TextBox and Collapse can be direct cell children, but deeper container nesting and table nesting are rejected safely.
7. Three paragraphs in one cell can be aligned left/center/right independently.
8. Read-only Notes render tables but show no mutation toolbar.

- [ ] **Step 5: Stop before merge**

Do not merge. Present the preview and gate results to the user for final visual/behavioral approval.
