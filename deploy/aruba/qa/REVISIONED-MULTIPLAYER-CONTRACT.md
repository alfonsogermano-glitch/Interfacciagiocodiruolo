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
