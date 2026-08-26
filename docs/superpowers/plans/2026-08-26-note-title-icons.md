# Note Title Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each campaign note display zero or one curated Lucide icon before its title in the Notes column, editable from the note kebab menu.

**Architecture:** Persist the icon as nullable `entity_notes.title_icon`, expose it through the existing note REST/update/realtime flow, and share one icon registry/grid between the rich-text inline picker and the new title picker. Keep `tab_name` unchanged and preserve the icon through all note duplication flows.

**Tech Stack:** React 18, TypeScript, lucide-react, Supabase/PostgreSQL, Hono edge function, repository verification scripts, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-note-title-icons-design.md`

## Global Constraints

- A note has zero or one title icon.
- The title icon must use exactly the same curated icon set/categories as the existing inline icon picker.
- `tab_name` must remain plain title text; spacing is CSS/layout only.
- Existing notes require no backfill beyond nullable `title_icon`.
- Duplicating notes/entities preserves the title icon.
- Existing hidden/private status icons remain independent metadata.

---

### Task 1: Cross-layer failing verification

**Files:**
- Create: `scripts/verify-note-title-icons.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository source files as text.
- Produces: `npm run verify:note-title-icons`, included in `npm run check`.

- [ ] **Step 1: Write the failing verification**

Create a script that asserts the presence of the approved contract across migration, server, `useEntityTabs`, duplication service, shared icon grid, `NoteContextualPickers`, and `NoteListRow`. It must fail before production code is changed.

- [ ] **Step 2: Wire it into package scripts**

Add `verify:note-title-icons` and include it in `check` before `build`.

- [ ] **Step 3: Verify RED**

Run CI on the feature branch and confirm the new verification fails because `title_icon`/shared title-icon UI do not exist yet.

---

### Task 2: Data and REST persistence

**Files:**
- Create: `supabase-add-note-title-icon.sql`
- Modify: `supabase/functions/server/index.tsx`

**Interfaces:**
- Consumes: request field `titleIcon: string | null | undefined`.
- Produces: database field `title_icon: string | null` in returned note rows.

- [ ] **Step 1: Add nullable schema field**

Create an idempotent migration adding `entity_notes.title_icon text` with a length constraint allowing `NULL` or 1..64 characters.

- [ ] **Step 2: Validate the REST field**

Extend `PUT /make-server-771c5bfd/notes/:noteId` to accept `titleIcon`, reject values other than `null` or non-empty strings up to 64 characters, and map valid values to `patch.title_icon`.

- [ ] **Step 3: Keep all unrelated route behavior unchanged**

Do not alter GET/POST authorization, visibility, hidden/folder reconciliation, content-rich validation, or delete behavior.

---

### Task 3: Client model, realtime, update handler, duplication

**Files:**
- Modify: `src/app/components/session/shared/useEntityTabs.ts`
- Modify: `src/services/supabase/entityNotesService.ts`

**Interfaces:**
- Produces: `EntityCustomTab.title_icon: string | null`.
- Produces: `handleSetNoteTitleIcon(tabId: string, titleIcon: string | null): Promise<void>` on `UseEntityTabsResult`.

- [ ] **Step 1: Extend note mapping**

Add `title_icon` to the client interface and normalize it to `null` in fetch, realtime, create, and duplicate mappings.

- [ ] **Step 2: Implement optimistic title-icon update**

Add `handleSetNoteTitleIcon` using the same optimistic/rollback pattern as visibility and folder changes, writing `{ titleIcon }` to the existing PUT route and aligning local state to the returned `data.note.title_icon`.

- [ ] **Step 3: Preserve title icon on direct note duplication**

Include `titleIcon: source.title_icon` in the second PUT inside `handleDuplicateCustomTab`.

- [ ] **Step 4: Preserve title icon on entity duplication**

Extend `EntityNoteRow` and the duplication PUT in `duplicateEntityNotes` to copy `title_icon`.

---

### Task 4: Shared icon catalog/grid and title picker UI

**Files:**
- Create: `src/app/components/session/shared/NoteIconGrid.tsx`
- Modify: `src/app/components/session/shared/NoteContextualPickers.tsx`
- Modify: `src/app/components/session/shared/NoteListRow.tsx`

**Interfaces:**
- Produces: `NOTE_ICON_COMPONENTS: Record<string, LucideIcon>` and `NoteIconGrid`.
- `NoteIconGrid` accepts `onChoose(name)`, optional `selectedName`, and optional `onRemove`.

- [ ] **Step 1: Extract the curated registry/grid**

Move the Lucide component registry and category grid out of `NoteContextualPickers.tsx` into `NoteIconGrid.tsx`, still sourcing categories from `tiptapIconData.ts`.

- [ ] **Step 2: Keep the inline picker behavior unchanged**

Replace the existing inline grid body with `<NoteIconGrid onChoose={...}>`, closing the popover after selection exactly as before.

- [ ] **Step 3: Add the note kebab action**

Add an `Icona` item in `NoteListRow` that opens a portal picker anchored beside the row. The picker uses `NoteIconGrid`, highlights the current icon, and shows `Rimuovi icona` only when an icon exists.

- [ ] **Step 4: Render the icon before title text**

Resolve `note.title_icon` through `NOTE_ICON_COMPONENTS` and render it immediately before `note.tab_name` with layout gap equivalent to about two spaces. Do not mutate title text.

---

### Task 5: GREEN verification and deployment readiness

**Files:**
- Modify only if verification reveals defects.

- [ ] **Step 1: Verify GREEN**

Run the new verification and full `npm run check` via CI. Fix production code, not the verification contract, unless the test itself is demonstrably wrong.

- [ ] **Step 2: Review branch diff**

Confirm changes are limited to the approved feature plus docs/test/migration and that no unrelated Note behavior changed.

- [ ] **Step 3: Prepare runtime rollout**

Apply the SQL migration to Supabase and deploy the updated edge function before/with merging the client change so the production UI never sends `titleIcon` to an old schema/API.

- [ ] **Step 4: Finish branch**

After CI is green, present/perform the agreed merge path and verify the resulting production deployment.