# Session sheets correction — 20261124-session-sheets-03

Corrects the owner/GM session Schede panel rather than claiming full site parity.

The session now owns its selection and a single slide-over with two persistent
columns: PG/PNG/Monsters on the left, the selected campaign-scoped detail on the
right. The underlying original EntityDetailView is shared, but no selection
dispatches global Personaggi navigation or opens its context overlay.
The existing global archive and read-only player authorization are unchanged.
CampaignHome PG/PNG/Monster requests enter this same session panel.

Embedded character/narrative details retain their Aruba capability boundaries.
Changing selection or closing via Escape waits for the current save queue and
note writes. A failed save keeps the selected sheet visible. The session rail
also flushes the current panel before switching to another tool.

Verified locally:

- Production build succeeds in `.local/vtt-session-sheets-candidate`.
- Focused Chromium fixture scenario verifies a single slide-over, measurable
  adjacent columns, PG → PNG → Monster → PG selection with the list visible,
  no global Personaggi overlay, and a failed character save preventing
  selection change until a successful retry.
- Existing focused original dice / 3D / formula / campaign Notes paths pass.
- Screenshot `.local/session-sheets-two-columns.png` is synthetic fixture data,
  not live records.

Images, custom dice persistence and other unfinished migration features are
not part of this frontend-only patch. No SQL writes or API restarts.
