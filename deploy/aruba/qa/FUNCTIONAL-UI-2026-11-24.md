# Functional UI correction — candidate 20261124-functional-ui-01

This is a corrective frontend candidate, not a declaration of complete site
parity. The production API/database are unchanged.

## Corrections

- Default builds include the original campaign Notes panel, still gated by
  authenticated capabilities and campaign ownership. Explicit
  `HG_CAMPAIGN_NOTES_CONTRACT=0` is the build-time opt-out.
- Notes-specific auth/campaign adapters resolve before generic shell adapters.
  Generic shared editor tools retain their intentionally inert legacy adapters.
- Vite resolver IDs are normalized on Windows to prevent duplicate React
  context instances.
- Campaign cards render the API-provided logo instead of always displaying the
  generic icon.
- Opening a character from a campaign card navigates to its actual sheet.
- Quick rolls animate the already computed result with the original 3D
  renderer. Dynamic imports, aborted effects and renderer cleanup are scoped
  to the current roll/campaign. Animation failure does not reroll or discard
  the recorded result.
- Vite preview no longer inherits the development API proxy.

## Verified locally

- Frontend Node suite: 529 passing.
- API Node suite: 304 passing (API code unchanged).
- Production build: pass, output `.local/vtt-functional-candidate`.
- Build module graph check: no original Supabase client / SDK modules.
- Chromium focused scenario: campaign logo, sheet opened from campaign card,
  quick d20 with a 3D canvas, note + sub-tab creation, rich-text save.
  These use isolated API fixtures, not live accounts.
- PostgreSQL `test_vtt_campaign_notes.sql`: BEGIN / DO / ROLLBACK passed in
  `hollowgate_auth_test`; owner writes, outsider denials, nesting, archive and
  preservation of the rich-text document are covered.

The older full `browser-original-notes.mjs` sequence still contains obsolete
CampaignHome controls and does not pass unmodified end-to-end. The focused
scenario is invoked with `HG_E2E_FOCUSED=1`; do not represent it as the full
historical browser suite.

## Not resolved / not claimed

- Historical campaign/character image associations: local test database has
  48 campaigns but zero logo/cover references and zero stored character
  portraits. This is NOT proof of the state of production.
- Live media audit must return aggregate counts before planning a selective
  recovery. No historical import, inferred ownership mapping or dump restore
  is authorized by this frontend patch.
- Multiplayer roll synchronization, complete custom dice settings, global
  catalog/editor and historical catalog are not activated by this release.
- Final authenticated live browser acceptance is still required.

## Production hand-off

Bundle: `/home/hgadmin/hg-functional-ui-01.tar.gz`.
Installer: `deploy/aruba/production/release-functional-ui.sh`.

Extract as root into `/opt` (archive top-level: `hg-functional-ui-01`), then run
`sudo bash /opt/hg-functional-ui-01/release-functional-ui.sh --preflight`.
It verifies ownership, permissions, every bundle hash, the currently deployed
VTT index and colliding asset hashes, and performs an aggregate READ ONLY
media audit. `--apply` repeats the checks, backs up the old index, copies only
new compiled assets, atomically swaps the index and verifies public hashes.
On post-swap failure it restores the previous index; old bundles are retained.
No SQL writes or container restarts are performed.
