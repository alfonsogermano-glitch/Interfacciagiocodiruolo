# Atomic menu services design (functional parity backlog)

Status: design for upcoming releases. The session Sheets visual phase is closed
with release `20261125-sheet-visual-10` (default portrait fallback fix).

## Contracts under design

### Copy character PG / NPC / Monster between campaigns

- `POST /vtt/campaigns/{sourceCampaignId}/characters/{characterId}/copies`
  body: `{ "targetCampaignId": "<uuid>" }`
- Response 201: `{ "character": { … } }`
- Semantics: atomic deep copy of sheet data, notes and media references into a
  NEW character draft owned by the GM of the target campaign. Source entity is
  NOT modified (copy, not move).
- Authorization: GM of source campaign only.

### Archive / remove entity from campaign

- Reuse existing archive semantics (`character_drafts.status`, narrative
  document archives) with explicit unassignment; NOT hard delete.
- Safeguards: last active PG per campaign; assignments cleanup.

### Remove player from roster

- Roster removal + assignment cleanup + safeguards.

## Frontend readiness

- `client.mjs` copy contract function + tests to be added with the API landing.
- No fake buttons: UI actions stay disabled/fail until the transport exists.
