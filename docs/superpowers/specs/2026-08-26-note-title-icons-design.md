# Note Title Icons Design

## Goal

Allow an editable campaign note to have zero or one Lucide icon displayed immediately before its title in the left Notes column.

## Approved behavior

- The note kebab menu exposes an `Icona` action.
- Activating it opens the same curated icon catalog and categories already used by the inline icon picker in note rich text.
- A note stores at most one icon. Choosing another icon replaces the previous one.
- When an icon exists, the picker offers `Rimuovi icona`.
- The icon is rendered immediately before the title text with visual spacing equivalent to roughly two spaces. The spacing is layout/CSS, not characters stored in `tab_name`.
- The icon is metadata, not part of the note title string and not part of the TipTap document.
- Duplicating a campaign note preserves its title icon and its existing sub-tabs.
- Existing notes remain valid with no icon.
- Realtime updates must propagate title-icon changes through the existing `entity_notes` database/broadcast flow.

## Data model and write boundary

Add nullable `entity_notes.title_icon text`. `NULL` means no title icon. The scalar database column itself enforces the one-icon-per-note invariant.

Expose one narrowly scoped PostgreSQL RPC, `set_entity_note_title_icon(p_note_id uuid, p_title_icon text)`, rather than widening every generic note-update call. The RPC is `SECURITY DEFINER`, validates authentication and icon length, and reproduces the same campaign-note write rule already used by the application: the campaign GM may edit any note; a campaign member may edit only a note whose `owner_profile_id` is their own. Deleted notes and non-campaign entity tabs are rejected.

This keeps the existing generic note REST endpoint and its large authorization surface unchanged while still updating the canonical `entity_notes` row, so existing database realtime/broadcast behavior remains the source of synchronization.

## UI architecture

Extract the current curated Lucide registry/grid into a small shared note-icon component so the inline rich-text picker and the note-title picker cannot drift to different icon sets.

`NoteListRow` owns title-picker open/anchor state and a small optimistic local title-icon state synchronized from the note row. Selecting/removing calls a focused `setNoteTitleIcon` service; success reloads the canonical note list and failure rolls the local icon back.

The title icon is rendered from the shared registry immediately before `note.tab_name`; the existing hidden/private status glyphs remain status metadata and are not folded into the title.

## Duplication

The `Duplica` action for a campaign note uses a focused helper that keeps the previous duplication semantics: create the copy, preserve rich/legacy content, hidden/folder state and sub-tabs, then copy the optional `title_icon` through the dedicated RPC. Other entity-tab duplication flows are unchanged because title icons are intentionally a feature only of the first-level campaign Notes column.

## Verification

Add a repository verification script wired into `npm run check` that verifies the cross-layer contract: migration/RPC authorization and validation, shared setter service, direct campaign-note duplication preservation, shared icon catalog usage, kebab action, replacement/removal, and title rendering.