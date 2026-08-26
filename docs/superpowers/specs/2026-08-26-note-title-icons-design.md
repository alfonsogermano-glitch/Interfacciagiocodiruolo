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
- Duplicating a note preserves its title icon. Entity-level duplication of notes preserves it as well.
- Existing notes remain valid with no icon.
- Realtime updates must propagate title-icon changes through the existing `entity_notes` broadcast flow.

## Data model

Add nullable `entity_notes.title_icon text`. `NULL` means no title icon. The database column itself enforces the one-icon-per-note invariant; the server accepts only `null` or a short non-empty string.

Client JSON uses `title_icon` on `EntityCustomTab`; write requests use `titleIcon` consistently with the existing camelCase REST request fields (`tabName`, `folderId`, `contentRich`, `tabOrder`).

## UI architecture

Extract the current curated Lucide registry/grid into a small shared note-icon component so the inline rich-text picker and the note-title picker cannot drift to different icon sets.

`NoteListRow` owns only the title-picker open/anchor state and invokes `tabs.handleSetNoteTitleIcon(note.id, value)`. The title icon is rendered from the shared registry immediately before `note.tab_name`; the existing hidden/private status glyphs remain status metadata and are not folded into the title.

## Persistence and failure behavior

`useEntityTabs.handleSetNoteTitleIcon` follows the existing optimistic-update pattern used by visibility/folder/hide changes: remember previous value, update local state, `PUT /notes/:id`, align to the server response on success, and roll back on failure.

The server validates `titleIcon`, maps it to `title_icon`, and returns the updated row through the existing `select('*')` path. Existing GET/POST behavior is otherwise unchanged.

## Verification

Add a repository verification script wired into `npm run check` that verifies the cross-layer contract: migration, server write mapping/validation, client type/mapping/handler, duplication preservation, shared icon catalog usage, kebab action, removal action, and title rendering.