# Custom Dice and Quick Roll Design

## Scope

This design adds two integrated capabilities to the existing Hollowgate dice subsystem:

1. a map-first **Quick Roll** surface for ad-hoc rolls without opening the full dice builder or saving a formula;
2. campaign-scoped **Custom Dice** whose faces show Hollowgate icons or user-uploaded images and may optionally carry numeric values.

The existing saved-formula library remains the single persistent library UI. A saved custom die appears in that same tree and inherits its folders, drag-and-drop, rename, duplicate, icon, and delete behavior.

## Product principles

- Quick rolls must take only a few clicks from the map.
- Rolling must never force-open roll history.
- The user decides whether roll history stays open or closed.
- Saved formulas remain the tool for recurring/prepared rolls.
- Custom dice define a reusable die type; quantity belongs to a roll or formula, not to the die definition.
- Existing numeric dice behavior and existing saved formulas must remain backward compatible.

## Quick Roll UX

The current floating purple die button becomes the entry point for Quick Roll instead of directly opening history.

When opened, the control expands vertically above the floating button and shows, in order:

- d4
- d6
- d8
- d10
- d12
- d20
- d100
- Custom die button, represented by a die with a question mark.

Each click adds one die of that type to the pending pool. Repeated clicks increase its quantity and display a quantity badge. Different die types may be mixed in the same pool, for example `1d100 + 2d20 + 1d8 + 1d6`.

The Quick Roll footer contains:

- Clear: empties the current pool;
- Roll: performs the current pool;
- Secret/Public toggle using the existing visibility semantics.

After Roll succeeds, the pending pool is cleared automatically. Repeating the same roll is handled by the existing Reroll action in history.

The Custom die button opens a compact selector of custom dice available to the current user in the current campaign. Selecting a custom die adds one instance to the pending pool; further additions increase its quantity exactly like standard dice.

## Roll history behavior and unread indicator

Roll history must no longer open automatically when a local or remote roll completes.

The floating dice button remains visible whether history is open or closed. A separate adjacent chevron controls roll history:

- chevron down: history closed;
- chevron up: history open.

If a newly revealed roll arrives while history is closed, the chevron receives a small unread-dot badge. This applies to both local rolls and rolls received from other players that the current user is allowed to see.

Opening history marks currently revealed unseen rolls as seen and clears the unread badge. Rolls that arrive while history is already open do not create an unread badge.

History-open state is user-controlled and must not be changed by `revealRoll`, animation completion, local submission, remote broadcast, or reroll.

## Custom Die definition

Supported custom die geometries in the first release:

- d4
- d6
- d8
- d10
- d12
- d20
- d100

A custom die definition is campaign-scoped and owner-scoped.

Each physical face has:

- a stable face index;
- a visual source:
  - Hollowgate standard icon, or
  - uploaded image asset;
- an optional human-readable label;
- an optional numeric value.

Numeric values are metadata used by the formula engine. They do not replace the physical face index required by the 3D engine.

A custom die may be purely symbolic. Numeric operations are legal only when every result participating in that numeric operation has a numeric value.

## d100 semantics

A d100 is represented physically by two d10 dice, not by one 100-faced custom object.

Therefore a custom d100 has twenty configurable physical faces:

- 10 faces for the tens die;
- 10 faces for the units die.

A custom d100 result displays the two symbols/images that physically landed, for example `Skull + Flame`. It does not collapse the pair into one symbolic face.

The numeric interpretation, when numeric values are configured, is derived from the two physical values using the existing percentile semantics. Symbol display remains a two-item result.

## Multiple custom dice

Every physical custom die result remains individually visible.

Example: five d6 custom dice may produce:

`Skull + Skull + Shield + Sword + Heart`

The same rule applies to all quantities and to mixed rolls. The chat/history renderer must preserve order at the physical-roll level.

## Saved custom dice and the existing formula library

No second library is introduced.

A saved custom die becomes a library node in the same mixed tree that currently contains saved formulas and folders.

Click behavior:

- clicking a saved formula rolls that formula immediately, unchanged from current behavior;
- clicking a saved custom die rolls exactly one instance of that die immediately;
- `Modify` on a saved custom die reopens its custom-die configurator.

The existing folder tree behavior applies to custom dice as well:

- drag and drop;
- nesting;
- rename;
- duplicate;
- icon selection;
- delete;
- root/folder ordering.

The mixed tree therefore supports three node types: formula, custom die, folder.

## Formula builder integration

The existing DiceToolbar retains its standard dice buttons and gains one additional Custom button immediately after d100.

Selecting it opens the current campaign custom-die selector. Choosing a custom die inserts a `custom-die` formula item. Quantity is editable with the same interaction model used for ordinary dice quantities.

A saved formula may combine standard dice, custom dice, and existing operators.

## Formula engine behavior

The canonical random result must be generated independently of the 3D renderer, preserving the current architecture where 3D only visualizes already-determined outcomes.

A custom die roll therefore records both:

- physical face identity/index for 3D projection and symbolic display;
- optional numeric value for arithmetic/keep/drop/compare/explosion compatibility.

Purely symbolic custom dice are valid for simple rolling and display.

Operations requiring numeric comparison or arithmetic must be rejected by validation if they can reach a custom die whose relevant faces do not all define numeric values. This includes numeric modifiers, keep/drop by value, comparisons, and exploding rules where trigger semantics rely on numeric faces.

The first implementation should not invent symbolic arithmetic. It either has complete numeric metadata or remains symbolic.

## Data model

Introduce a `dice_custom_dice` table with at least:

- `id uuid primary key`;
- `campaign_id uuid not null`;
- `owner_profile_id uuid not null`;
- `name text not null`;
- `sides integer not null` constrained to 4, 6, 8, 10, 12, 20, 100;
- `faces jsonb not null` containing validated face definitions;
- appearance settings for the first release: body color and symbol color;
- `icon_name text null` for the library row;
- `folder_id uuid null` referencing the existing dice-formula folder tree;
- `sort_order integer not null default -1`;
- timestamps.

The existing folder RPCs and ordering helpers must be generalized so formulas and custom dice can coexist as first-class mixed nodes without introducing a parallel folder system.

RLS must restrict reads/writes to the owner in a campaign to which that owner belongs, matching the existing saved-formula security model.

## Uploaded face assets

User-uploaded custom-face images live in a dedicated Supabase Storage bucket/path namespace for dice-face assets.

Uploads are campaign/owner scoped and validated client-side before upload.

Initial constraints:

- image MIME types only;
- square-normalized client output;
- bounded pixel dimensions;
- bounded file size;
- generated opaque storage path, never original local path;
- remove orphaned owned assets when replacing/deleting faces where safe.

The browser should normalize uploaded images before storage so large source files do not become large runtime textures.

Hollowgate standard icons are stored as icon identifiers and require no uploaded asset.

## 3D rendering

The current renderer already separates canonical roll generation from 3D visualization. That invariant remains.

For standard dice, existing rendering is unchanged.

For custom dice, add a custom 3D projection payload that identifies the custom-die definition, physical face index, and forced result.

The renderer layer is responsible for producing materials/textures that place the configured icon/image on each physical face while respecting the canonical forced result.

First-release visual customization includes:

- body color;
- symbol/image color where applicable;
- existing base material support where technically stable.

Advanced themed effects such as animated flames, ice, stone, obsidian, glow, or shaders are explicitly a follow-up layer and are not required to make the first custom-die release complete.

If the underlying dice-box library cannot safely express per-face custom textures through its public API, isolate the adaptation behind a Hollowgate custom-die renderer/material module rather than leaking library-specific assumptions into the formula engine.

## Chat/history presentation

Standard dice continue showing numeric faces and totals as today.

Custom dice show their configured icon/image/label for every physical die result.

If numeric values exist, the chat may also show a numeric aggregate where meaningful, but the symbols remain the primary face-level result.

For a purely symbolic roll there is no fabricated numeric total. The UI must not display a misleading `0` total.

For mixed numeric and symbolic rolls, the renderer must make clear which portions are symbolic and only present aggregate numeric calculations that are actually defined.

Reroll preserves the exact custom-die IDs/definitions referenced by the original source items.

## State and realtime

A `RollResult` sent through realtime must contain enough immutable outcome information to render custom results on another client without rerolling locally.

Do not transmit raw uploaded file bytes through realtime. Send durable asset references/URLs or storage identifiers plus face metadata required for display.

Quick Roll pending state is local transient UI state and is never persisted to Supabase.

History-open/unread state is local UI state. Campaign changes reset pending Quick Roll selection and unread state.

## Error handling

- A deleted custom die referenced by an old saved formula must fail clearly at validation/load time rather than silently substituting a standard die.
- Missing uploaded face artwork falls back to label/icon placeholder while preserving the canonical result.
- Storage upload failure must not create a half-saved custom die definition.
- Database save failure must not discard a successfully prepared local configuration before the user can retry.
- 3D custom rendering failure must fall back to the existing non-3D result reveal; it must never invalidate the canonical roll.

## Migration and backward compatibility

Existing saved formulas and existing dice-formula folders require no manual migration by users.

Folder RPCs may need schema-level extension for a third node type (`custom-die`), but all current formula/folder calls must continue to work unchanged.

Existing `DiceFormulaItem` JSON remains readable. New formula items use a discriminated `custom-die` shape so old formulas require no rewrite.

Existing realtime standard-roll payloads remain valid.

## Testing strategy

Use TDD and permanent verification scripts consistent with the existing dice subsystem.

Coverage must include:

- Quick Roll quantity accumulation, mixed dice, clear, roll-and-reset, secret/public;
- history never auto-opens on reveal;
- unread-dot transitions;
- custom-die face validation for each supported geometry;
- d100 two-d10 face/result semantics;
- repeated custom-die rolls preserving every physical symbol;
- numeric-capable versus purely symbolic validation;
- saved custom die as a mixed library node including folder drag/drop and deletion behavior;
- realtime round-trip of custom results;
- reroll preserving custom-die identity;
- custom 3D projection using canonical forced faces;
- fallback when 3D custom rendering is unavailable;
- Supabase RLS and storage ownership constraints;
- full `npm run check` before final integration.

## Deployment constraints

Do not create Vercel Preview deployments.

All repository changes, including this spec, the implementation plan, migrations, tests, and implementation, are to be integrated in one final clean commit/update of `main` after local/synthetic RED-GREEN verification is complete.

Supabase schema/storage changes are applied only as part of the approved implementation and verified before the final completion claim.

After the single final `main` update, verify GitHub CI and the Vercel Production deployment against the exact same commit SHA before reporting completion.
