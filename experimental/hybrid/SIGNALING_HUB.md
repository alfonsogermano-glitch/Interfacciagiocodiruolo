# Hollowgate Connect — signaling-only proof of concept

This Node.js localhost API automates WebRTC SDP offer/answer exchange.
The **only** online responsibilities after an approved production rewrite:
ephemeral room code, short-lived peer capability, and delivery of signaling.
There is no Supabase, Auth migration, campaign content, player notes,
dice history, chat, storage, or permanent database.

```bash
node --test experimental/hybrid/signaling-hub.test.mjs
```

**Not production-ready.** It listens only on 127.0.0.1. There is no
TLS endpoint, no verified Hollowgate account identity, no rate limiting,
no threat monitoring or internet deployment. Room join is capability-based
with a code and is not an approval from an authenticated GM. Sending
offers/answers must never be trusted as proof of identity. A separate
HTTPS/WSS public deployment, optional TURN credentials, and authentication
are necessary before exposing this endpoint.

API:
- POST /v1/create {} → host room, bearer token, peerId
- POST /v1/join {room} → player token and peerId
- POST /v1/send {room,to,kind,description} → offer/answer/candidate only
- POST /v1/poll {room,after} → receiver-specific messages
- POST /v1/leave {room} → remove player or close room as host

Room expires after 30 minutes idle. No gameplay content should be sent
through the hub. Polling is intentionally basic until a WebSocket
authenticated relay becomes available.
