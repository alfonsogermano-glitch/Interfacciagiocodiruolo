# Note Title Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each campaign note display zero or one curated Lucide icon before its title in the Notes column, editable from the note kebab menu.

**Architecture:** Persist the icon as nullable `entity_notes.title_icon`, write it through one narrowly scoped authenticated PostgreSQL RPC, and keep the existing generic note REST routes unchanged. Share one Lucide registry/grid between the rich-text inline picker and the title picker; the direct campaign-note duplicate flow preserves the optional icon and existing sub-tabs.

**Tech Stack:** React 18, TypeScript, lucide-react, Supabase/PostgreSQL RPC, repository verification scripts, Vite.

**Spec:** `docs/superpowers/specs/2026-08-26-note-title-icons-design.md`

## Global Constraints

- A campaign note has zero or one title icon.
- The title icon uses exactly the same curated icon set/categories as the existing inline icon picker.
- `tab_name` remains plain title text; spacing is CSS/layout only.
- Existing notes require no data backfill beyond nullable `title_icon`.
- Direct campaign-note duplication preserves the title icon and sub-tabs.
- Existing hidden/private status icons remain independent metadata.
- Title-icon write permission matches campaign-note editing: GM any note; member only their own note.

---

### Task 1: Cross-layer failing verification

**Files:**
- Create: `scripts/verify-note-title-icons.mjs`
- Modify: `package.json`

- [x] Write the verification contract before production code.
- [x] Wire `verify:note-title-icons` into `npm run check`.
- [x] Verify RED: the contract failed before `supabase-add-note-title-icon.sql` existed.

### Task 2: Data model and scoped RPC

**Files:**
- Create: `supabase-add-note-title-icon.sql`

- [x] Add nullable `entity_notes.title_icon text` with an idempotent validation constraint.
- [x] Add `set_entity_note_title_icon(p_note_id uuid, p_title_icon text)` as a `SECURITY DEFINER` function with a fixed search path.
- [x] Enforce GM-or-own-note-member authorization and reject deleted/non-campaign notes.
- [x] Revoke public execution and grant only to `authenticated`.

### Task 3: Focused service and duplication preservation

**Files:**
- Create: `src/services/supabase/noteTitleIconService.ts`

- [x] Add `setNoteTitleIcon(noteId, titleIcon)` calling the scoped RPC.
- [x] Add `duplicateCampaignNoteWithTitleIcon(...)` using the existing protected REST create/content flow.
- [x] Copy `title_icon` through the RPC and keep the existing sub-tab duplication path.

### Task 4: Shared icon catalog/grid and title picker UI

**Files:**
- Create: `src/app/components/session/shared/NoteIconGrid.tsx`
- Modify: `src/app/components/session/shared/NoteContextualPickers.tsx`
- Modify: `src/app/components/session/shared/NoteListRow.tsx`

- [x] Extract one curated React icon registry/grid sourced from `tiptapIconData.ts`.
- [x] Reuse it in the inline rich-text icon picker without changing inline behavior.
- [x] Add local optimistic title-icon state synchronized from the canonical note row.
- [x] Add `Icona` to the note kebab menu with selection/replacement/removal.
- [x] Delegate direct note duplication to the title-aware helper.
- [x] Render the icon before `tab_name` with `gap-2`, without modifying title text.

### Task 5: Verification and rollout

- [x] Confirm the production schema types used by the RPC (`uuid` note/campaign ids and text profile ids).
- [ ] Run current CI through `npm run check` and require typecheck, all note verification scripts, the new title-icon verification, and Vite build to pass.
- [ ] Review the final branch diff for unrelated changes.
- [ ] Apply `supabase-add-note-title-icon.sql` through Supabase migration tooling.
- [ ] Merge the verified branch to `main` and confirm the production deployment.