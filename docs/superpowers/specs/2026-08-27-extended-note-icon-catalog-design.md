# Extended Note Icon Catalog — Design

Date: 2026-08-27
Status: Approved design, implementation pending
Scope: Hollowgate session Notes icon system

## 1. Goal

Expand Hollowgate's curated Note icon catalog from the current 60 Lucide icons to exactly 210 unique Lucide icons while preserving the existing Note data model and editor behavior.

The same catalog must remain available in both current insertion paths:

- inline icons inside rich-text Notes;
- title icons in every existing first-level Note row in the session Notes UI that already supports a title icon, including the shared Campaign Notes and GM Notes flows.

The picker must become practical at the larger catalog size by adding search, Italian aliases, and a local Recenti section.

The feature must not copy or reproduce another VTT's proprietary icon set. It may reproduce the same class of user experience using the Lucide dependency already present in Hollowgate.

## 2. Non-goals

This project does not:

- add Tabler, Phosphor, Game Icons, or another icon dependency;
- add user-uploaded/custom SVG icons;
- add icon colors, per-icon styling, or filled/duotone variants;
- add favorites in the first release;
- change the Note title-icon database schema;
- change the TipTap JSON format used for inline icons;
- rename or remove any of the 60 existing icon identifiers;
- add title-icon support to entity types or UI locations that do not already have it;
- alter checkbox, radio, table, TextBox, Collapse, clipboard, selection, cursor, or deletion behavior in Notes;
- create a Supabase migration.

## 3. Existing architecture to preserve

Hollowgate already stores inline Note icons by Lucide icon name in the `inlineIcon` TipTap mark. Rendering is based on generated raw SVG primitives in `tiptapIconData.ts`. This architecture is intentionally independent of React component rendering so the icon remains a normal ZWSP-backed text position for ProseMirror cursor, selection, Backspace, Delete, and clipboard semantics.

The title-icon picker and inline-icon picker share `NoteIconGrid`, but `NoteIconGrid` currently maintains a second manual React registry (`NOTE_ICON_COMPONENTS`) with direct `lucide-react` imports. That duplicated registry is manageable for 60 icons but should not scale to 210.

The existing `scripts/extract-lucide-icons.mjs` remains the development-time generator. No runtime dependency on Lucide's private internal file structure is introduced.

## 4. Catalog size and category allocation

The initial extended catalog contains exactly 210 unique icon identifiers distributed as follows:

| Category | Count |
| --- | ---: |
| Combattimento | 24 |
| Magia & Occulto | 24 |
| Horror & Mistero | 22 |
| Creature & Natura | 22 |
| Personaggi | 18 |
| Luoghi | 20 |
| Oggetti & Equipaggiamento | 26 |
| Viaggio & Veicoli | 18 |
| Dadi & Gioco | 16 |
| Simboli & Stati | 20 |
| **Total** | **210** |

The implementation may choose the exact new Lucide identifiers while building the catalog, subject to all of these rules:

1. all 60 currently supported identifiers remain present with exactly the same stored names;
2. every identifier resolves against the installed `lucide-react` version, using explicit compatibility overrides only where Lucide has retained a public alias but changed the physical module filename;
3. no identifier appears in more than one category;
4. icons must remain visually legible at approximately 16–20 px;
5. near-duplicate variants that provide no useful VTT distinction should be avoided;
6. the selection must provide useful coverage for common horror/RPG note concepts rather than filling category quotas with arbitrary UI symbols;
7. category counts above are acceptance requirements, not targets.

The generator must fail rather than silently emit a catalog that violates the exact count, contains duplicate identifiers, or references an unavailable icon.

## 5. Single generated icon registry

### 5.1 Source of truth

`extract-lucide-icons.mjs` remains the authored source of truth for the curated catalog. Each catalog entry gains metadata sufficient for the UI:

```ts
{
  name: 'Skull',
  label: 'Teschio',
  aliases: ['teschio', 'morte', 'cranio', 'skull'],
  category: 'Horror & Mistero'
}
```

`name` is the stable storage identifier and must remain the Lucide-compatible identifier used today.

`label` is the human-facing Italian tooltip/search label.

`aliases` are search synonyms. They may include Italian and English words. Search normalization is applied at runtime, so aliases may contain ordinary accented Italian text.

`category` must match one of the ten category labels defined above.

### 5.2 Generated output

`tiptapIconData.ts` is regenerated to expose both raw SVG data and metadata, for example:

```ts
export type NoteIconMeta = {
  name: string;
  label: string;
  aliases: string[];
  category: string;
};

export const ICON_CATEGORIES: { label: string; icons: string[] }[];
export const ICON_META: Record<string, NoteIconMeta>;
export const ICON_DATA: Record<string, IconPrimitive[]>;
```

`ICON_DATA` remains the source used by the ProseMirror decoration renderer.

`ICON_META` and `ICON_CATEGORIES` become the source used by the picker UI and search.

No second hand-maintained icon-name registry is allowed.

## 6. Picker rendering

`NoteIconGrid.tsx` stops importing all curated icon components individually from `lucide-react` and removes `NOTE_ICON_COMPONENTS`.

Instead, it renders the same raw primitives already present in `ICON_DATA`. A small internal glyph renderer creates an `<svg viewBox="0 0 24 24">` using the generated primitive array and the same Lucide visual contract currently used by inline icons:

- `fill="none"`;
- `stroke="currentColor"`;
- stroke width 2;
- round line caps and joins.

This makes the generated data the single rendering source for both:

- the React picker glyph;
- the TipTap inline decoration glyph.

The stored icon name passed to `onChoose(name)` remains unchanged.

## 7. Search behavior

A search field labeled `Cerca icona…` appears at the top of the shared picker.

Search normalization must:

- lowercase text;
- trim surrounding whitespace;
- collapse repeated internal whitespace;
- remove diacritics so, for example, accented and unaccented input match identically.

For every icon, the searchable corpus consists of:

- stable `name`;
- Italian `label`;
- all `aliases`;
- category label.

A multi-word query is split into tokens. Every query token must match at least one normalized corpus field for the icon to be included. This is AND semantics across query tokens.

Examples:

- `teschio` can match `Skull` through label/alias metadata;
- `skull` can match the same icon through stable name/alias;
- `spada fuoco` only returns icons whose combined metadata satisfies both tokens.

When the query is empty, the normal categorized view is shown.

When the query is non-empty, categories are replaced by one flat `Risultati` grid in canonical catalog order.

If there are no results, the picker shows `Nessuna icona trovata.`

Search does not change selection, insertion behavior, or persisted data.

## 8. Recenti

When the search query is empty, a `Recenti` section appears above the categories if at least one recent icon exists.

Behavior:

- local-only persistence via `localStorage` key `hollowgate.notes.recent-icons`;
- maximum 12 icon names;
- newest selection first;
- selecting an icon already present moves it to the front rather than duplicating it;
- only names still present in `ICON_META` are rendered;
- invalid JSON, storage denial, or stale names are ignored without breaking the picker;
- selecting from either existing insertion path (inline icon or Note title icon) updates the same Recenti list.

Recenti is a convenience cache only. It is not synchronized to Supabase and is not campaign-specific.

## 9. Tooltip and palette behavior

Each icon button continues to use Hollowgate's shared palette-aware Tooltip.

Tooltip text uses the human-facing Italian `label`, not the raw Lucide identifier. The stable identifier remains available only internally for persistence and search.

Tooltip colors must continue to come from `TooltipColorsProvider` and therefore from the currently selected dashboard palette. No picker-specific hardcoded tooltip colors are introduced.

## 10. Compatibility guarantees

### 10.1 Existing inline icons

The existing TipTap mark shape remains unchanged. A saved mark containing `name: 'Sword'`, `name: 'Skull'`, or any other current identifier must render exactly as before.

No Note content migration is required.

### 10.2 Existing title icons

Existing title-icon values in every current session-Note title-icon flow remain valid because all current 60 identifiers remain in the new catalog with the same names.

No title-icon service or database migration is required.

### 10.3 Unknown/stale identifiers

The existing runtime fallback to `DEFAULT_ICON_NAME` remains in place for defensive rendering of an unknown stored inline icon identifier. This fallback must not rewrite saved data.

The picker itself must never emit an unknown identifier.

## 11. Performance and bundle strategy

The project must not import the complete Lucide catalog into the client bundle.

Only the 210 curated icons are extracted at development time into the generated raw SVG dataset.

Removing the 210-component React import registry avoids adding a second representation of the same catalog to the picker code.

The picker performs search over the in-memory 210-entry metadata array. No server call, worker, indexing library, or virtualization is required at this size.

No new npm dependency is introduced.

## 12. Error handling and generator validation

`extract-lucide-icons.mjs` must exit non-zero with an actionable message when any of these conditions occurs:

- the catalog does not contain exactly 210 unique identifiers;
- a category does not contain its specified count;
- an identifier appears twice;
- an icon module cannot be resolved;
- a resolved module lacks the expected raw icon-node export;
- metadata is missing a non-empty `label`;
- metadata contains an invalid category;
- generated `ICON_DATA` and `ICON_META` do not contain the same set of names.

Runtime storage errors for Recenti are non-fatal and must be swallowed locally; they must not prevent inserting an icon.

## 13. Testing strategy

Implementation follows TDD.

Required regressions:

1. **Catalog integrity**
   - exactly 210 unique icons;
   - exact category counts;
   - all original 60 identifiers preserved;
   - every metadata entry has label, aliases array, category, and SVG data;
   - generated metadata and SVG key sets are identical.

2. **Generator failure behavior**
   - missing/duplicate/invalid entries produce a non-zero generator result or equivalent directly testable validation failure.

3. **Search**
   - matches stable English name;
   - matches Italian label;
   - matches aliases;
   - ignores case and diacritics;
   - applies AND semantics to multiple tokens;
   - returns canonical catalog order;
   - empty query returns the category view contract;
   - no-match state is deterministic.

4. **Recenti**
   - newest-first;
   - deduplicates;
   - maximum 12;
   - ignores stale identifiers;
   - tolerates malformed/unavailable localStorage.

5. **Shared renderer**
   - `NoteIconGrid` no longer contains the manual `NOTE_ICON_COMPONENTS` registry;
   - picker glyphs are rendered from generated `ICON_DATA`;
   - inline TipTap renderer still consumes the same generated `ICON_DATA` and keeps its existing cursor/deletion architecture.

6. **Picker integration**
   - both existing inline and Note-title insertion paths continue to use `NoteIconGrid`;
   - both insertion paths update Recenti;
   - both pass the stable icon `name` to existing persistence/insertion handlers;
   - tooltips use the shared palette-aware Tooltip and the Italian label.

Existing Note regressions covering cursor movement, copy/paste, Backspace/Delete, checkbox/radio, tables, TextBox/Collapse, title icons, and picker visibility must remain green.

## 14. Expected implementation surface

The implementation is expected to modify or add only files directly related to this feature, likely including:

- `scripts/extract-lucide-icons.mjs`;
- generated `src/app/components/session/shared/tiptapIconData.ts`;
- `src/app/components/session/shared/NoteIconGrid.tsx`;
- one small pure search/recent helper module if separating those responsibilities keeps `NoteIconGrid` focused;
- targeted verification scripts/tests.

`tiptapInlineIcon.ts` should require no behavioral redesign. Any edit there must be justified by a concrete compatibility need discovered during implementation.

No Supabase migration, service rewrite, or unrelated Note editor refactor belongs in this feature.

## 15. Acceptance criteria

The feature is complete when all of the following are true:

- the picker exposes exactly 210 curated Lucide icons across the specified ten categories;
- all 60 current icons are still available under their existing identifiers;
- inline icons and all existing session-Note title-icon flows use the same generated registry;
- the manual React component registry has been removed;
- search works by Italian label, English/stable name, aliases, category, case-insensitively and accent-insensitively;
- empty-query view shows Recenti (when populated) followed by categories;
- Recenti is shared between title and inline pickers, capped at 12, and persisted locally;
- icon tooltips use Italian labels and the active Hollowgate palette;
- existing saved Notes and title icons require no migration and continue rendering;
- no new runtime icon library or npm dependency is introduced;
- targeted regressions and all relevant pre-existing Note regressions pass;
- the final implementation diff contains no unrelated files.
