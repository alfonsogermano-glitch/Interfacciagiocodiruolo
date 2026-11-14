# Hollowgate Aruba — TURN staging preparation (NOT deployed)

This is an **opt-in, separate** coturn service. It is deliberately not linked to the default API Compose project, the production DNS, Caddy routes, or any existing staging application.

## Before a manual trial

1. Verify that the actual VPS public IPv4, the proposed TURN hostname DNS and the host's existing UDP/TCP bindings are correct. **Do not assume** any hostname or address is configured.
2. Prepare a **new random 32-byte secret encoded as 64 lowercase hex characters**. Store its 64-character ASCII text (no quotes or leading spaces, optionally followed by exactly one LF newline) in `/opt/hollowgate/config/turn_shared_secret`, owned by coturn image UID/GID 65534:65534 with mode `0600`; the host administrator retains privileged access. **Use a separate private copy with identical ASCII bytes for the API**, owned by its runtime UID 1001 with mode `0600`, and mount that copy at the API `TURN_SHARED_SECRET_FILE` path. Never share one `0600` file between two different unprivileged container UIDs. Never commit, print or paste its contents.
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
The API now validates a file containing exactly 64 lowercase hex characters, optionally followed by a single LF. It removes only that final newline and uses the **ASCII text** as the HMAC key, matching the coturn launcher. Extra whitespace, uppercase characters and hex-decoding are rejected. Prefer `openssl rand -hex 32` with a private umask, writing directly to the protected file without displaying the resulting secret.

### Runtime coturn 4.18 smoke test
The 4.18 release removed `no-cli` and `no-dtls`. A CI job now starts the real image and launcher with disposable secrets and TLS on a Docker bridge without published ports. This checks process startup only, not public relay connectivity or UDP allocations.

### Unprivileged container ownership
The official Alpine image runs as `nobody:nogroup` (65534:65534). Its `/run/hollowgate` tmpfs must be owned by that identity; the secret and certificate/key bind mounts must be readable by that identity with strict mode 0600. The Aruba API uses another unprivileged UID, so supply an independently permissioned private copy of the **same key bytes** for that service. Verify all ownership/mounts before manually starting anything.

### Hardened derived image
The upstream Alpine image sets the executable file capability `CAP_NET_BIND_SERVICE`, which is unnecessary for ports 3478/5349 but conflicts with `cap_drop: [ALL]` and `no-new-privileges` on process start. The accompanying Dockerfile removes that capability during image construction and then returns to `nobody:nogroup`. The isolated CI smoke must build this derived image and run the exact startup script with all runtime capabilities dropped. Manual operation uses `docker compose build` before `up`, only following review.

### Real TURN Allocate acceptance test
The isolated runner now performs an actual RFC 5766 TURN Allocate handshake over UDP, obtains an unauthenticated 401 nonce challenge, then uses an ephemeral Aruba service-generated username and password to request an allocation. It verifies a relayed address and positive lifetime and confirms that an incorrect password cannot allocate. The probe sends to a private Docker bridge address without publishing ports to the runner's public interface. This is **not** a PC-to-Android or externally reachable TURN certification.

### Browser relay-only CI acceptance test

A separate CI job now runs **two independent Chromium contexts** with the original browser WebRTC signaling probe, authenticates both against disposable HTTPS endpoints, requests short-lived TURN credentials from the real Aruba issuance service, and negotiates `iceTransportPolicy: "relay"`. The test fails unless both sides connect and `getStats()` identifies the selected route as `relay`. It starts a **separate test-only coturn configuration** on a private Docker bridge without publishing host ports, with freshly generated test secrets and with the hardened container user/capability restrictions. Because both CI browsers run on the same host, this proves only the relay-only path works in isolation; it cannot certify NAT traversal between different physical networks or PC–Android performance. The CI-only TURN config intentionally allows private Docker peers and must **never** be used as the production Aruba configuration.


### Read-only VPS preflight (must pass before any manual start)

The operator must run the following **on the actual Aruba host**, from the checked-out repository, with the real TURN hostname and verified public IPv4. Use no real identifiers in CI and never paste keys into chat:

```sh
sudo python3 deploy/aruba/turn/qa/preflight.py \
  --hostname <verified-turn-hostname> \
  --ipv4 <verified-public-ipv4>
```

This preflight checks, **without modifying the VPS**, that:

- The hostname resolves to the provided, globally routable IPv4 (no private or documentation address).
- The coturn secret at `/opt/hollowgate/config/turn_shared_secret` belongs to UID 65534 with mode 0600; the matching private API copy at `/opt/hollowgate/config/turn_api_shared_secret` belongs to UID 1001 with mode 0600. Only matching ASCII keys are accepted; their contents are never printed.
- The TLS private key belongs to UID 65534 and is mode 0600, the matching certificate covers the TURN hostname, its issuing chain validates against the VPS system trust store for TLS server usage, and it remains valid for at least seven days.
- No local process currently uses TURN ports 3478/UDP+TCP and 5349/TCP or relay UDP ports 49160–49200. The check fails closed if `ss` or OpenSSL cannot run.

**Do not enable any feature flag or start the container just because this command succeeds.** DNS resolution is not proof of public UDP reachability, and this cannot inspect Aruba's external firewall, NAT path, TLS from remote clients, public DNS propagation or PC/Android behavior. The operator must separately inspect Aruba's firewall and host rules, TLS renewals and existing services. If preflight fails, resolve the discrepancy without exposing secrets or opening unrelated ports.

Rollback after a subsequently authorized *manual-only* staging trial: stop only this distinct Compose project/service, disable `AUTH_VTT_TURN_ENABLED`, and restore the prior firewall rules under the operator's change plan. Do not stop the production API, change `main`, alter existing Caddy routes or touch unrelated services.


### External network reachability — after a separately approved manual staging trial

Run the **unauthenticated**, read-only probe from a computer on a *different network* than the Aruba VPS (for example PC on another ISP, and subsequently Android with its own browser diagnostics):

```sh
node deploy/aruba/turn/qa/external-turn-probe.mjs --hostname <verified-turn-dns-name>
```

The command sends a standard unauthenticated TURN Allocate request over UDP port 3478 and requires a proper 401 nonce challenge. It then establishes a TLS connection to port 5349, validating the server certificate chain and that the hostname matches. The test sends **no TURN credential, cookie, gameplay event or session identifier**. A successful probe verifies external reachability and a trusted TLS listener **from that specific network**; it does not prove relay allocation, browser interoperability, the TCP fallback, session revocation, latency or other networks. Test multiple carriers separately.

This command must **not** run as part of production deployment or periodic monitoring until explicitly authorized. If it reports `TURN_EXTERNAL_REACHABILITY_BLOCKED`, keep the API TURN feature flag disabled and diagnose DNS, both firewalls, port ownership or certificate renewal manually. Never bypass TLS validation or publish the shared secret to debug it.

The preflight's certificate trust check uses the **VPS system CA store** through OpenSSL `verify -purpose sslserver -verify_hostname`; this is a local prerequisite only. A successful result is not a substitute for a real client-side TLS handshake and certificate verification from another network.
