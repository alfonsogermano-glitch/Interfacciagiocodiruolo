# Note Tables — Design Specification

Date: 2026-08-23
Status: Approved design, implementation not started
Scope: Hollowgate Notes rich-text editor

## Goal

Add editable tables to Notes without turning the editor into a spreadsheet. Tables must feel native to the existing TipTap editor, use the current palette, persist inside the existing `content_rich` JSON, and require no database/Supabase/RLS/storage changes.

## Existing context

- Notes use TipTap JSON persisted through the existing `onUpdate -> content_rich` flow.
- `@tiptap/extension-table` 3.29.1 is already installed but not registered in `RichTextEditor`.
- Existing custom blocks (`TextBox`, `CollapseBlock`) already enforce restricted nesting: a TextBox/Collapse cannot contain another TextBox/Collapse.
- Text alignment currently targets `paragraph`, which allows alignment to remain independent for each paragraph/line inside a table cell.
- PR #9 (`ui/note-horizontal-rule-minus`) is separate and must not be implicitly merged by this work. Before implementation edits to `RichTextEditor.tsx`, sync with the then-current `main` so the toolbar icon change is not accidentally overwritten if PR #9 has landed.

## Table insertion

- Add a `Table2` toolbar button in the existing **Blocchi** section.
- Clicking it inserts a table immediately; there is no size selector or setup dialog.
- Default table size is exactly **3 rows × 3 columns**.
- The initial table has normal cells, not an automatic header row or header column.
- A table cannot be inserted while the cursor is already inside another table.
- Nested tables are forbidden through toolbar insertion, paste, drag/drop, and transaction guards.

## Layout and styling

- A table uses the full currently available width of the Note editor (`width: 100%`).
- Columns share available width automatically unless content forces a larger minimum.
- The existing Note editor horizontal overflow remains the fallback for content that cannot fit.
- No manual column-resize handles in the first version.
- Styling follows dashboard palette tokens only:
  - table/cell borders: `--dash-border-soft`
  - regular cell background: transparent / editor background
  - header cell background: `--dash-surface-2`
  - text: `--dash-text`
  - contextual toolbar: existing panel/surface/accent tokens
- No hard-coded palette color and no green success styling.

## Contextual table toolbar

The table is considered active when the editor selection/cursor is inside one of its cells. While active and editable, a compact **single-column vertical toolbar** appears immediately to the right of that table. It disappears when the selection leaves the table.

The toolbar contains icon-only buttons with tooltips, in this exact functional set:

1. **Add row before** — inserts a row before the row containing the cursor.
2. **Add row after** — inserts a row after the row containing the cursor.
3. **Add column before** — inserts a column before the column containing the cursor.
4. **Add column after** — inserts a column after the column containing the cursor.
5. **Toggle header row** — converts the current row between normal cells and header cells.
6. **Toggle header column** — converts the current column between normal cells and header cells.
7. **Delete row** — removes the row containing the cursor.
8. **Delete column** — removes the column containing the cursor.
9. **Copy table** — copies the entire active table to the system/browser clipboard; it does not duplicate the table in-place.
10. **Delete table** — removes the complete active table.

Destructive actions must use the existing enabled/disabled command capability rather than throwing if the operation is invalid (for example, deleting the last remaining row/column if TipTap disallows it).

## Table engine

Use TipTap `TableKit` from the already installed `@tiptap/extension-table` package, with custom configuration/extension only where Hollowgate behavior differs from the default.

Native commands map directly to the requested operations:

- `insertTable({ rows: 3, cols: 3, withHeaderRow: false })`
- `addRowBefore()`
- `addRowAfter()`
- `addColumnBefore()`
- `addColumnAfter()`
- `toggleHeaderRow()`
- `toggleHeaderColumn()`
- `deleteRow()`
- `deleteColumn()`
- `deleteTable()`

`Tab` and `Shift+Tab` retain TipTap/ProseMirror table navigation behavior.

## Cell content and nesting rules

A cell may contain multiple normal editor blocks. The user may insert as many independent elements as desired, including text paragraphs, lists, images, task items, horizontal rules, inline icons/checkboxes, TextBox and CollapseBlock where their schemas permit.

Nesting depth rules:

- A table cell is one container level.
- A TextBox or CollapseBlock may be placed directly inside a cell.
- Existing TextBox/Collapse guards continue to prevent another TextBox/Collapse inside those containers.
- A table may never appear inside another table cell, TextBox, or CollapseBlock.
- Paste/drag/drop must not be able to bypass these restrictions.

Implementation should prefer a schema/command guard plus a transaction safety guard so invalid nested content is rejected silently rather than corrupting the ProseMirror document.

## Alignment inside cells

The existing left/center/right alignment controls must work inside table cells.

Alignment remains paragraph-scoped, not cell-scoped. Therefore, if a cell contains multiple paragraphs/rows, each paragraph can have a different alignment independently. Example: first paragraph left, second centered, third right.

Block elements inside a paragraph follow that paragraph's alignment. Independent block nodes retain their own normal layout unless their content contains aligned paragraphs.

No separate table-only alignment UI is introduced.

## Copy and paste across Notes/tabs

`Copy table` writes to the **system/browser clipboard**, not to React state, a Note-local variable, or a single-tab cache. The goal is portability between:

- another position in the same Note;
- another Note in the same Hollowgate application tab;
- another browser tab/window running Hollowgate;
- any other Hollowgate editor surface that supports table paste and where the user has permission to edit.

Clipboard output is multi-format:

1. `text/html` — portable HTML table representation; always provided.
2. `text/plain` — readable tab/newline fallback; always provided.
3. Hollowgate structured table JSON — provided through a custom clipboard MIME type when supported by the browser, and mirrored in a Hollowgate marker embedded in the HTML payload so same-site paste can recover the exact TipTap table structure even when custom MIME support is unavailable.

Paste behavior inside a Hollowgate Note editor:

- If Hollowgate structured payload is present and valid, reconstruct the exact TipTap table node, preserving header state and supported nested editor content.
- Otherwise, accept normal `text/html` table content through TipTap's parser.
- Otherwise, fall back to plain text.
- If pasted while the cursor is inside another table, reject insertion of a nested table and leave the document valid.
- If the destination editor is read-only or the user lacks edit permission, do not mutate content.

Paste outside Hollowgate is intentionally graceful: other applications receive a conventional HTML table or plain text rather than Hollowgate-specific JSON.

Clipboard writes are initiated directly by the user's Copy button click. Failure (browser permission/security restriction) must show a concise non-destructive error/toast and must not alter the table.

## Selection and toolbar positioning

- Contextual toolbar activation is derived from the current ProseMirror selection, not from stale component state.
- Resolve the ancestor table position from the current selection.
- Position the vertical toolbar relative to the rendered table wrapper so it tracks scrolling and responsive width.
- Toolbar interactions must preserve the relevant table/cell selection long enough for the command to execute; clicking a toolbar button must not blur the editor and lose the target cell first.
- The toolbar must not be persisted in document JSON and must not appear in read-only rendered content.

## Persistence and compatibility

- Tables are ordinary TipTap document nodes inside `content_rich`.
- No database migration.
- No Supabase schema, RLS, Storage, API, or presence changes.
- Existing Notes without tables remain unchanged.
- Legacy Note migration behavior remains unchanged.
- Read-only rendering must display saved tables correctly without exposing mutation controls.

## Error handling

- Invalid row/column commands: disabled/no-op; never throw to the UI.
- Clipboard write failure: visible concise error, no document mutation.
- Invalid Hollowgate clipboard payload: ignore structured payload and fall back to HTML/plain text.
- Invalid nested table paste: reject nested table insertion without damaging surrounding content.
- `fixTables()` may be used after structural operations if required by TipTap to normalize table structure.

## Testing strategy

Implementation uses TDD and adds a focused verifier/test suite covering at minimum:

1. TableKit registered in the Note editor.
2. Table button inserts exactly 3×3 with no default header.
3. Table insertion blocked inside an existing table.
4. Add row before/after operates relative to cursor row.
5. Add column before/after operates relative to cursor column.
6. Header row toggle affects the current row.
7. Header column toggle affects the current column.
8. Delete row/column targets cursor row/column.
9. Delete table removes only the active table.
10. Contextual toolbar visible only for an active editable table.
11. Text alignment remains independent per paragraph inside a cell.
12. Direct TextBox/Collapse inside a cell is valid.
13. Deeper TextBox/Collapse nesting remains rejected by existing guards.
14. Nested table insertion/paste is rejected.
15. Copy produces HTML + plain text and structured Hollowgate payload where supported.
16. Structured copy/paste round-trip preserves table shape, headers and supported nested content across separate editor instances.
17. Clipboard failure is non-destructive.
18. Production build/typecheck/canonical existing verifiers remain green.

## Acceptance criteria

The feature is accepted when, in Vercel preview and authenticated smoke testing:

- one click creates a responsive 3×3 table;
- the right-side contextual toolbar appears only while working in that table;
- all ten requested operations work against the row/column containing the cursor;
- header row/column toggles are visible and persistent;
- tables adapt to Note width and remain usable on narrower views;
- multiple blocks can be entered in cells without permitting forbidden second-level container nesting;
- each paragraph in a multi-paragraph cell can have independent left/center/right alignment;
- copied tables can be pasted into another Note and another Hollowgate browser tab while preserving supported rich content;
- no unrelated Notes behavior regresses;
- CI and Vercel are green;
- no merge to `main` occurs without explicit user approval.
