# Note Title Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each campaign note display zero or one curated Lucide icon before its title in the Notes column, editable from the note kebab menu.

**Architecture:** Persist the icon as nullable `entity_notes.title_icon`, write it through one narrowly scoped authenticated PostgreSQL RPC, and keep the existing note REST routes unchanged. Share one Lucide registry/grid between the rich-text inline picker and the title picker, and centralize duplication so title icons survive both direct note copies and entity-level note copies.

**Tech Stack:** React 18, TypeScript, lucide-react, Supabase/PostgreSQL RPC, repository verification scripts, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-note-title-icons-design.md`

## Global Constraints

- A note has zero or one title icon.
- The title icon must use exactly the same curated icon set/categories as the existing inline icon picker.
- `tab_name` must remain plain title text; spacing is CSS/layout only.
- Existing notes require no data backfill beyond nullable `title_icon`.
- Duplicating notes/entities preserves the title icon.
- Existing hidden/private status icons remain independent metadata.
- The title-icon write permission must match campaign-note editing: GM any note; member only their own note.

---

### Task 1: Cross-layer failing verification

**Files:**
- Create: `scripts/verify-note-title-icons.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository source files as text.
- Produces: `npm run verify:note-title-icons`, included in `npm run check`.

- [ ] **Step 1: Write the failing verification**

Assert the approved contract across migration/RPC, setter/duplication service, shared icon grid, inline picker reuse, and `NoteListRow` menu/rendering.

- [ ] **Step 2: Wire it into package scripts**

Add `verify:note-title-icons` and include it in `check` before `build`.

- [ ] **Step 3: Verify RED**

Run the verification before production code exists and confirm it fails because the migration/shared icon UI are missing.

---

### Task 2: Data model and scoped RPC

**Files:**
- Create: `supabase-add-note-title-icon.sql`

**Interfaces:**
- Produces: `entity_notes.title_icon text null`.
- Produces: `public.set_entity_note_title_icon(p_note_id uuid, p_title_icon text)` executable by `authenticated`.

- [ ] **Step 1: Add nullable schema field**

Create an idempotent migration adding `title_icon text` and a constraint allowing `NULL` or a trimmed 1..64 character value.

- [ ] **Step 2: Implement RPC authorization**

Reject anonymous callers, deleted/non-campaign notes, and callers who are neither the campaign GM nor the note owner while still an active campaign member.

- [ ] **Step 3: Update canonical row**

Set `title_icon` and `updated_at`, return the updated row, revoke public execution, and grant execute to `authenticated`.

---

### Task 3: Shared setter and duplication preservation

**Files:**
- Create: `src/services/supabase/noteTitleIconService.ts`
- Modify: `src/services/supabase/entityNotesService.ts`

**Interfaces:**
- Produces: `setNoteTitleIcon(noteId: string, titleIcon: string | null): Promise<void>`.
- Produces: `duplicateSingleEntityNote(...) => Promise<string>`.

- [ ] **Step 1: Add focused setter service**

Call `supabase.rpc('set_entity_note_title_icon', { p_note_id, p_title_icon })`, throwing on configuration or RPC errors.

- [ ] **Step 2: Preserve title icon during entity duplication**

Extend the fetched note row shape with `title_icon` and call the setter on each created copy when needed.

- [ ] **Step 3: Centralize single-note duplication**

Move the existing direct note copy sequence into `duplicateSingleEntityNote`: POST the copy, PUT rich/legacy content, copy title icon through the setter, recursively duplicate the source note's sub-tabs, and return the copied note id.

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

Replace the inline picker's local grid with `<NoteIconGrid onChoose={...}>`, closing the popover after selection exactly as before.

- [ ] **Step 3: Add optimistic title icon state**

`NoteListRow` reads the runtime `title_icon` returned by the existing `select('*')` note fetch, mirrors it in local state, updates optimistically through `setNoteTitleIcon`, reloads canonical tabs on success, and rolls back on failure.

- [ ] **Step 4: Add the note kebab action**

Add `Icona`, opening a portal picker anchored beside the note row. Highlight the current icon and show `Rimuovi icona` only when an icon exists.

- [ ] **Step 5: Preserve direct duplication behavior**

Delegate the existing `Duplica` menu item to `duplicateSingleEntityNote`, then reload tabs and select the returned copy.

- [ ] **Step 6: Render the icon before title text**

Resolve the local title icon through `NOTE_ICON_COMPONENTS` and render it immediately before `note.tab_name` with `gap-2`; do not mutate title text.

---

### Task 5: GREEN verification and rollout

**Files:**
- Modify only if verification reveals defects.

- [ ] **Step 1: Verify GREEN**

Run the new verification and the strongest available repository checks. Fix production code, not the verification contract, unless the test itself is demonstrably wrong.

- [ ] **Step 2: Review branch diff**

Confirm changes are limited to the approved feature plus docs/test/migration and that no unrelated Note behavior changed.

- [ ] **Step 3: Apply migration**

Apply `supabase-add-note-title-icon.sql` through Supabase before merging the client change.

- [ ] **Step 4: Finish branch**

After checks are green, merge the feature branch to `main` and verify the resulting production deployment.