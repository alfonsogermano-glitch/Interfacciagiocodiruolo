# Hollowgate Aruba — TURN staging preparation (NOT deployed)

This is an **opt-in, separate** coturn service. It is deliberately not linked to the default API Compose project, the production DNS, Caddy routes, or any existing staging application.

## Before a manual trial

1. Verify that the actual VPS public IPv4, the proposed TURN hostname DNS and the host's existing UDP/TCP bindings are correct. **Do not assume** any hostname or address is configured.
2. Prepare a **new random 32-byte secret encoded as 64 lowercase hex characters**. Store its 64-character ASCII text (no quotes or leading spaces, optionally followed by exactly one newline) in `/opt/hollowgate/config/turn_shared_secret`, readable only by the administrator (`chmod 600`). Use this exact file also as the Aruba API `TURN_SHARED_SECRET_FILE`. Never commit, print or paste its contents.
3. Supply a valid matching TLS certificate and private key as `/opt/hollowgate/config/tls/turn-fullchain.pem` and `turn-privkey.pem`. They must be accessible to the container's mount namespace. Certificate issuance and renewal are separate controlled operations.
4. Review host firewall **and Aruba provider firewall** before allowing `3478/udp`, `3478/tcp`, `5349/tcp` and relay `49160-49200/udp`. All other unnecessary ports should remain closed. This service uses **host networking**, so the container has direct access to host ports.
5. Confirm that no existing service is bound on those ports and the relay will not interfere with existing production workloads. This profile has `restart: "no"`.

Do not run this deployment automatically. After a manual security review, `TURN_HOSTNAME` and `TURN_PUBLIC_IPV4` must be supplied explicitly when running `docker compose -f deploy/aruba/turn/compose.turn.staging.yaml --profile manual-turn config`, then only on approval start the service. API feature flags `AUTH_VTT_SIGNALING_ENABLED` and `AUTH_VTT_TURN_ENABLED` remain **false by default**.

### Recommended client URLs after successful network checks

Use `turn:<verified-host>:3478?transport=udp` and `turns:<verified-host>:5349?transport=tcp`. Configure `TURN_URLS` with the actual public hostname. Do not use a placeholder in live settings.

### Acceptance criteria

Use real accounts and verify that revoked memberships cannot obtain credentials, authenticated connections negotiate a **relay** route from different networks, certificates validate, credential expiry is enforced, traffic does not expose campaign data and the initial connection works on PC and Android. A local Chromium success is **not** sufficient to certify these checks.

The coturn REST scheme uses `username="<expiry_epoch>:<user_uuid>"` and `HMAC-SHA1(username, shared_secret_ascii)`. The backend reads ASCII hex from `TURN_SHARED_SECRET_FILE` and coturn consumes the same ASCII secret in memory, never shipping it to browser clients.

### Secret byte compatibility
The API now validates a file containing exactly 64 lowercase hex characters, optionally followed by a single LF or CRLF. It removes only that final newline and uses the **ASCII text** as the HMAC key, matching the coturn launcher. Extra whitespace, uppercase characters and hex-decoding are rejected. Prefer `openssl rand -hex 32` with a private umask, writing directly to the protected file without displaying the resulting secret.
