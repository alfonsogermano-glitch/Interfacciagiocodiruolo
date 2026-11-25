# Atomic menu services design (functional parity backlog)

Status: design for upcoming releases. The session Sheets visual phase is closed
with release `20261125-sheet-visual-10` (default portrait fallback fix).

## Current batch status (2026-11-25, single-upgrade batch)

- Character copy contract aligned to the original site shape:
  `POST /vtt/characters/{characterId}/copy-to-campaign` with body
  `{ "campaignId": "<targetCampaignId>" }` (mirrored from
  `SessionCharactersPanel.handleConfirmCopy`).
- Aruba client `copyCharacterToCampaign` implemented in
  `apps/aruba-vtt-pilot/src/client.mjs` and wired into the session Sheets panel
  action “Copia in un’altra campagna” (dialog + confirm + error state).
- Frontend verification: 549 tests pass, production build OK, Chromium browser
  render of the new action OK (no console errors).
- Release package prepared for the single upcoming functional upgrade:
  ID `20261125-menu-copy-11`, baseline live index hash
  `ef12083f067ad577d6d517233c8c1cab415b2b7e12b433d248d63a46319a05e3`,
  archive SHA256 `50c9a406595c56d87df6907ca93a75a4f0b4fb26c850d83d6d7d1b01a8f8f297`.

## Contracts under design

### Copy character PG / NPC / Monster between campaigns

- `POST /vtt/characters/{characterId}/copy-to-campaign`
  body: `{ "campaignId": "<targetCampaignId>" }`
- Response: `{ "character": { … } }` (o conferma equivalente)
- Semantics: atomic deep copy of sheet data, notes and media references into a
  NEW character draft owned by the GM of the target campaign. Source entity is
  NOT modified (copy, not move).
- Authorization: GM of source campaign only.

The Aruba client mirrors the original Supabase-era contract shape
(`SessionCharactersPanel.handleConfirmCopy` → `POST /characters/{id}/copy-to-campaign`
con `{campaignId}`), adapted to Aruba same-origin cookies.

### Archive / remove entity from campaign

- Reuse existing archive semantics (`character_drafts.status`, narrative
  document archives) with explicit unassignment; NOT hard delete.
- Safeguards: last active PG per campaign; assignments cleanup.

### Remove player from roster

- Roster removal + assignment cleanup + safeguards.

## Frontend readiness

- `client.mjs` copy contract function + tests to be added with the API landing.
- No fake buttons: UI actions stay disabled/fail until the transport exists.
