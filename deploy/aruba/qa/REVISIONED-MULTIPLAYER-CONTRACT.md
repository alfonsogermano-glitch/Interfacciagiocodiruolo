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
route to the canonical original map reducers. The router currently lists
`map_object_layer_action` as GM-only, so player layer requests cannot pass
through it yet even if this gate would authorize them; enable only after
reviewing the entire original authorization chain.

Do not enable this pathway on the public VTT without real original reducer,
verified membership, end-to-end browser interaction, and visual parity tests.
