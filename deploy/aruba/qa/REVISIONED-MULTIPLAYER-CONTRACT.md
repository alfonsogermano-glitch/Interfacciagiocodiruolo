# Experimental revisioned multiplayer synchronization

The separate `ArubaRevisionedSnapshotStream.mjs` is a **test-only, opt-in primitive**, not integrated with the VTT shell, the existing GM event router or Aruba deployment.

## Strict authoritative source contract

- The GM must own an **atomically consistent per-player visible snapshot** and its nonnegative safe-integer revision N. The revision and state must come from the *same* state transaction; an ordinary asynchronous snapshot combined with independently incremented event counters is **not sufficient**.
- Only events already authorized and projected for that specific campaign member may receive per-player visible revisions N+1, N+2, etc. GM-only events must **not** be part of that visible sequence; never expose private event names, contents, or counts.
- Revisions originate from trusted GM state, **never** from incoming DataChannel messages, player-provided IDs or browser UI.
- The source must feed events promptly and in an order consistent with its snapshot transaction. Missing revisions and conflicting repeated revisions cause a **closed** channel, rather than speculative recovery.
- This transport caps each frame at 60,000 UTF-8 bytes and buffered events at 128 / 512,000 bytes. Oversized snapshots require a future authenticated, chunked protocol; this implementation must not silently truncate them.
- Initial snapshots are passed through an **explicit player-specific visibility projection**; no default authorization exists. Projected events need equivalent authorization *before* they reach `publishVisibleDelta`.
- A successful unit test is not proof of crash recovery, deterministic replay, persisted revision counters, multi-device correctness, or actual campaign source integration.

## Before enabling in real Hollowgate

Implement the canonical revisioned GM state producer, per-member visibility projection, atomic snapshot + event cursor acquisition, recovery or intentional full resync on gaps, browser receiver with revision validation, large snapshot chunking, and testing against original map/token/dice/notes events and two physical networks.

Keep the current fail-closed release parity gate enabled. Do not deploy or enable this experimental primitive in production.

## GM-local revision source prototype

`ArubaGmRevisionedCampaignSource.mjs` is a separate **opt-in in-memory producer**, with no original VTT shell wiring. The caller supplies the initial GM-owned state and three required synchronous, trusted callbacks:

- `applyGmEvent` computes the next canonical state without side effects or asynchronous work.
- `projectVisibleSnapshot` returns a player-specific view of that state.
- `projectVisibleEvent` returns either a player-specific, already-authorized event or `null` for hidden events.

A single synchronous commit prepares the next state and every recipient's projection **before** changing the state or incrementing any revisions. A failed projector aborts the whole transaction. Each verified connection starts a new revision sequence with its initial snapshot; only the events visible to that recipient advance its counter. A hidden GM-only event does not even consume a revision or reveal its existence. The source registers the stream's delivery callback before requesting an asynchronous snapshot, so intervening committed events can be reconciled against the snapshot's revision.

**Important:** This is not yet the original campaign state reducer, it does not persist or replay events, and does not provide a cross-process transaction or authenticated peer discovery. The application must verify the GM and each participant before invoking it, ensure the snapshot projection and event projection are semantically consistent, and reconnect with a fresh verified peer ID. Do not enable without the full original-state parity tests and source-driven visibility review.

## Isolated player revision receiver

`ArubaRevisionedPlayerReceiver.mjs` supplies a **separate opt-in browser-side
receiver**, not mounted in the production Hollowgate UI. The caller must bind
it only to the authenticated GM DataChannel and provide synchronous
`applySnapshot` and `applyDelta` callbacks that validate the original
campaign/map state schema and return `true` on successful application.

The receiver requires `initial-snapshot` on each fresh channel, accepts
only original Hollowgate broadcast event names, rejects additional envelope
fields, malformed and oversized frames, duplicate initial snapshots, and
missing or out-of-order visible revisions. A replayed revision already
applied is ignored; a gap closes the channel so the app can explicitly
establish a fresh authenticated session and full state.

**This does not itself authorize players or enforce the original map/notes
visibility rules.** Those remain duties of the GM's trusted source and
projection callbacks; a custom UI reducer must also reject invalid data.
Passing unit tests does not demonstrate all original map assets and state
fields, persisted revisions, snapshot chunking, or physical-network behavior.
Do not turn this on in the VTT until those requirements are verified.

## Source-aligned original map fog and lighting

The isolated `ArubaOriginalMapRevisionProjection.mjs` uses the original
`sessionMapVisibility.ts` and `mapObjectLayers.ts` projections. It also
includes `mapFog` as originally published by `SessionWorkspace.tsx` on
`active_scene_map_patch`: it **does not invent a visibility flag for fog**.
This includes operations cover/reveal, persistence, opacity, geometry,
`exploredAreas`, `lightExploredAreas`, and vision blockers. The complete
`light` and `vision` objects of visible tokens and POIs are retained
unaltered; hidden tokens/POIs remain omitted under the original rules.

Source geometry and lighting are carried as data; no rendering equivalence,
line-of-sight algorithms, shader behavior or cross-device visual fidelity
is established by these tests. Existing 60 KB frame limits still require
separate chunking for complex scenes. Never enable in the public VTT based
on these tests alone.

## Verified player -> GM map mutation gate (experimental)

`ArubaVerifiedPlayerMapAuthorization.mjs` checks a small, explicit
subset of existing Hollowgate player map requests before they are passed to
the GM. The actor ID comes **only** from independently verified signaling
identity, never from the untrusted `actorProfileId` on the wire. The current
authoritative map state and active chapter must come from the GM runtime.

For token movement and POI movement, the original GM source accepts unlocked,
unpinned objects (ownership not required). Token transforms, token metadata
updates, POI edits and layer reordering require matching creator identity and
the original lock/pin guards. A request for any hidden object is conservatively
rejected rather than trusting that its ID would never be disclosed. The new
gate is intentionally narrower than the full original UI: creation, deletion,
magnet actions, undo/redo, previews and several mixed/batch commands remain
unsupported. This should not be mistaken for functional parity.

The module returns a sanitized command; **it does not mutate the GM state**.
Callers must re-authorize against current state at delivery time and then
route to the canonical original map reducers. The GM event router recognizes `map_object_layer_action` as a **player
candidate** consistent with `SessionWorkspace`, but it still denies the event
by default and only forwards it when `authorizePlayerEvent` approves. No
player packet can directly publish `active_scene_map_patch` or otherwise
bypass authoritative GM publication. The GM receive handler must re-run
`authorizeVerifiedPlayerMapRequest` against the current authoritative state
before invoking the original handlers, and must never treat `actorProfileId`
from a DataChannel packet as a verified identity. This is NOT yet wired into
the original VTT interaction handlers.

Do not enable this pathway on the public VTT without real original reducer,
verified membership, end-to-end browser interaction, and visual parity tests.

## Original GM handler dispatch bridge (still isolated)

`ArubaVerifiedGmMapDispatch.mjs` is the next **opt-in** component. It can
be wired as both `authorizePlayerEvent` and `receiveFromPlayer` on the
existing `createGmHostEventRouter`, subject to verified signaling identity.
Each operation calls **synchronous**, GM-owned
`getCurrentMapContext({campaignId})` and `isVerifiedMember({campaignId,userId})`.
The GM receive path repeats the complete authorization against the **current**
chapter and original map state, after any earlier router policy preflight.
It does not trust the player-supplied `actorProfileId`, accepts only the
reviewed token, POI and layer commands, blocks nested commands, and sends
the sanitized payload to injected *original* action handlers.

A rejected operation MUST NOT mutate any map. The bridge does not apply
events, publish deltas, or substitute reducers. Original history attribution,
map state mutation, event revisioning and UI should happen inside the actual
SessionWorkspace handlers after they are safely mounted. Callbacks that
perform asynchronous mutation are unsupported: the bridge expects the
original handlers to execute synchronously. An outbound router call may report
success for network delivery while the GM rejects a request during this
second-stage check; the eventual protocol needs an explicit acknowledgment
and rejection result.

This remains a source-derived **unit/in-memory-router test**, not a mounted
real original map UI, not a production connection, and not a release
certification.

## Correlated GM command results (isolated prototype)

`ArubaVerifiedMapRequestResults.mjs` wraps the reauthorizing GM dispatcher
with correlation IDs and bounded replay suppression. The requestId is a
player-supplied UUID used **only** to match the result to a previously sent
request. Sender identity comes solely from authenticated signaling and
current campaign membership; outgoing result delivery must be bound to that
verified user, not to an arbitrary peer-supplied address. Identical replay
cannot re-run an action; conflicting reuse of a requestId is rejected.
Unverified, malformed or oversized requests and revoked memberships produce
no result. A revoked membership during application cancels delivery.

A `map-command-result` with `outcome: "dispatched"` **only** confirms that
the synchronous GM handler did not reject or throw. It does NOT certify
database persistence, revisioned publication, or successful graphical
rendering. `outcome: "rejected"` means that GM execution was denied or
failed. This experimental callback is not yet a negotiated RTC wire event;
it is intentionally separate from the legacy broadcast event vocabulary,
and is NOT mounted in the original VTT.

The router's own `publish()` return value means successful delivery to
its GM callback, NOT application. Never display that return value as
player-visible success. For true applied-state confirmation, match the
request to a committed revision or authoritative state acknowledgment
once the original SessionWorkspace and revision producer are integrated.

## Client-received revision confirmation (isolated; not persistence)

The opt-in `ArubaRevisionedPlayerReceiver` can now emit `onApplied`
after a synchronous `applySnapshot` or `applyDelta` returns `true`.
The callback does not fire on duplicates, failed application, malformed
messages or revision gaps. A throwing callback fail-closes the receiver.

`ArubaVerifiedRevisionConfirmation` keeps bounded per-user request IDs
mapped to a GM-allocated per-peer visible revision. This expectation must
be registered by trusted GM code **only after a successful authoritative
revision commit**. It accepts an acknowledgment solely from the *same*
server-verified campaign user and current peer, rechecks membership,
and refuses acknowledgments beyond the trusted GM's published revision
reader. When the user's receiver acknowledges a revision, the GM may
send `map-command-result` with `outcome: "received-revision"` to that
verified user. Duplicate acknowledgments do not repeat responses, and
pending expectations must be explicitly revoked when the peer disconnects.

This is a **client-reported receipt**, not proof of rendering, durable
persistence, or honest client behavior. No client acknowledgment wire
protocol has yet been installed in the active VTT, and the source's
revision allocation alone is insufficient evidence of delivery. The
GM's command result is still `dispatched` until a matching player
receipt is observed. There is no end-user success UI yet.

Never interpret untrusted WebRTC request IDs, usernames, claimed
campaign IDs or claimed peer IDs as authenticated identity. The
membership, peer generation and outgoing recipient must be established
from the signaling integration independently.

## WebRTC technical applied-revision receipts (isolated browser QA)

`ArubaRevisionReceiptDataChannel.mjs` uses a separate, strictly parsed
`{"type":"applied-revision","revision":N}` control envelope on the same
pre-verified RTCDataChannel as original application state. The player sends
this only from `ArubaRevisionedPlayerReceiver.onApplied`, after its reducer
returns `true`. The GM attaches a **different listener** which ignores
ordinary snapshot/delta or legacy event frames. The message contains
**no trusted user ID, campaign or peer ID**. Those bindings are supplied
by the server-verified signaling proof captured at channel attachment.

The GM correlates only revisions already allocated to the same verified
peer and user, checks membership and its trusted published revision, and
sends `received-revision` results only to the verified destination.
Disconnect closes the listener and cancels pending acknowledgments.
A client may still lie about its applied state. This is not persistence
or rendering proof; actual command-to-source-commit integration is not
mounted in the normal Hollowgate shell.

The isolated real Chromium test now checks actual player-to-GM receipt
transport alongside original map projection and GM-to-player revisioned
state on two WebRTC peers. No production infrastructure is changed.

## Original GM observed map -> revisioned source -> correlated command receipt

The isolated `ArubaObservedGmMapCommandCoordinator.mjs` joins the existing
GM-authorization dispatcher, its original action handler callback, the
GM-owned per-peer revision source and the request-result/receipt trackers.

The new `publishObservedMap({authenticatedGmUserId,nextState})` on
`ArubaGmRevisionedCampaignSource` publishes a **trusted canonical state
snapshot captured after the ORIGINAL SessionWorkspace handler**. It does
not run the source's separate `applyGmEvent` reducer, preventing duplicate
application. All original visibility projections and per-peer revision
checks remain in place.

Before publication the coordinator registers one expectation for the
request ID at that verified peer's next visible revision, so synchronous
DataChannel receipt cannot race the registration. The expectation is canceled
if the authoritative projection generated **no visible revision** or the
source rejected publication. Mere GM handler acceptance stays
`outcome: "dispatched"`. A later `received-revision` requires actual
onApplied player receipt over the verified peer channel, with membership,
peer and published revision checks.

The in-memory tests use original map filtering and injected GM handler
slots. **The original React SessionWorkspace refs are not yet mounted**
into this bridge, and no durable DB completion or visual rendering is
certified. A failure to publish an already-applied original handler change
cannot automatically roll that change back; production integration needs
a deliberate recovery/resnapshot policy before enabling this flow.

## Recovery barrier after failed original-GM map publication

Original `SessionWorkspace.tsx` contains asynchronous `publishMapPatch`
calls. Its React state may not be current synchronously after an action
handler returns. **Never attach the observed-state coordinator directly to
the original handler refs until a committed/settled GM state notification
is available.**

The isolated coordinator now sets `suspended` and invokes
`onResyncRequired` if an original handler has already executed but the
subsequent visible-state publication fails, throws, loses the verified peer,
or allocates an inconsistent revision. It stops accepting additional player
commands. It intentionally **does not roll back** the authoritative GM
state or guess what the old client observed.

A trusted GM can recover via `recoverAfterVerifiedResnapshot` with
GM-authorized **current** canonical map state. The source first validates
the original map visibility projection, then revokes every previous peer
and revision generation, installs the new authoritative state, and requires
clients to reconnect with a **new initial snapshot at revision zero**.
Only after this validated reset can the coordinator resume accepting
player commands. Existing per-peer request result and receipt trackers
must be separately revoked/rotated by the authenticated connection owner
when the old peer is removed.

This is a safety barrier tested in isolation, not automatic recovery,
not persistence, and not an installed React UI feature. In particular,
the current proof does not guarantee a newly settled React state at the
instant the original asynchronous publication completes; that original
lifecycle hook is needed before actual integration.

## Settled original active-scene publication observation (read-only)

The actual original `useActiveScene.ts` debounces `publishMapPatch`
requests for 100 ms and then schedules a serial promise queue.
Calling `publishMapPatch` is **not** an acknowledgment; the returned
promise does not await the queued persistence or broadcast. Multiple
player changes can coalesce within this debounce window.

A small opt-in, campaign-scoped
`activeScenePublicationObserver.ts` now emits a cloned publication
**after** the original queue has awaited both
`saveActiveScene(campaignId, persisted)` and
`send('active_scene_map_patch', {patch})`. Unsubscribed listeners
receive nothing. Subscriber exceptions cannot block the existing
publication pipeline. The observer does not alter any JSX, the
original map tools, React state or legacy network messages.

**Important:** this notification indicates settled completion of those
two awaited original API calls only; it is not a promise of durable DB
commit beyond the service contract or actual remote client rendering.
There is still no installed SessionWorkspace-to-Aruba coordinator bridge
or correlation of the original debounce batch with an individual
player command. Do not use the earlier synchronous
`getCurrentMapContext` shortcut as evidence of completion. Actual
integration will need command-to-batch correlation, chapter identity,
cleanup on campaign changes, and recovery on publication failures.

## Correlation of coalesced ORIGINAL settled map publications (isolated)

The original `publishMapPatch` uses a 100 ms debounce, so several
verified player operations may be represented by a single settled
`active_scene_map_patch`. It contains **no player request IDs**.
Assigning that revision to all pending player requests would falsely
confirm actions which were blocked or superseded.

`ArubaSettledMapRequestCorrelator.mjs` subscribes to the actual
campaign-scoped `subscribeCommittedMapPublication` notification.
The authenticated GM component may register a request with the
verified player/peer, active chapter and trusted baseline publication
timestamp. The GM must supply `proveRequestedEffect`: an explicit
per-request predicate on a CLONED settled map state. Only requests
with proven effects and strictly newer publication timestamps receive
a receipt expectation. Multiple proven requests coalesced into one
publish receive the same per-peer visible revision; unproven requests
remain pending. If the settled publication makes no visible change,
there is no receipt expectation.

The GM revision stream is populated from the original settled state,
not a second reducer. A publication failure suspends the correlator
and requests a safe GM resnapshot; a simple handler return value is
not enough to claim application. Unsubscribe/revocation prevents
further correlation.

**Limitations:** Proof predicates must be carefully tied to original
requests and cannot prove that an intermediate update survived a later
overwrite when the final state matches an unrelated action. The
prototype does not yet mount command registration into the original
SessionWorkspace handlers, does not prove rendering or durable
remote delivery, and does not implement an acknowledgment timeout.
Never treat proof of matching state alone as proof of user intent
or enable this feature without an authenticated end-to-end review.

## Same-object concurrent player commands (conservative correlation)

The isolated settled map correlator now requires canonical GM-owned
`effectKeys` per accepted request, such as `token:<id>:position-x`
or `drawing:<id>:rotation`. These are scoped to the original logical
object and field, independent of player identity, and MUST be generated
by trusted GM-side request interpretation, never from a player claim.

If two **matched pending requests** overlap on any effect key during
a single debounced publication, both become unconfirmable. They are
removed from pending correlation rather than retained for a later
unrelated publication. A third request for a disjoint field may still
receive a correlated visible revision. The original map publication
continues to all connected players regardless of whether any command
is attributable.

This is intentionally conservative: the final state cannot demonstrate
which of two concurrent writes caused it, even when both requested the
same value. It does not prove authorship against unrelated GM edits
outside the registered request set. A future integrated pathway must
attach these canonical keys at the original handler boundary and
include genuine per-command disposition; the prototype MUST NOT
represent this as complete concurrent-edit correctness or graphical
parity.

## Further settled-correlation safety checks (pre-integration)

The correlator rejects registration against a baseline older than its latest
observed committed publication. A proof callback throwing is treated as an
unconfirmed command, but its canonical field keys still participate in
same-batch conflict detection: another request touching the same field must
not inherit an unprovable attribution. These checks are isolated regression
coverage, **not** evidence that SessionWorkspace is already wired to the
revisioned GM stream or that end-to-end multiplayer is complete.

## Request replay ledger lifetime

The opt-in GM request-result adapter retains up to 4096 request IDs per
instance, and refuses new IDs when full rather than evicting old IDs. An
evicted ID could otherwise be replayed and execute its original GM handler
again. The authenticated connection owner must close and recreate this
adapter on a new verified connection generation; this is a conservative
capacity barrier, not an automatic reconnect implementation.
