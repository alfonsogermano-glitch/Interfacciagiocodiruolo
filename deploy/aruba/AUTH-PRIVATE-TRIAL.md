# Private real-auth trial (opt-in, NOT deployed)

The current static preview remains the default. These files are an OPTIONAL alternate configuration:
- deploy/aruba/Caddyfile.auth-trial: protects all five user-facing pages, /auth-ui/* and /auth/* with HTTPS Caddy Basic Auth; exposes only explicitly allowed API paths and no other API surfaces.
- deploy/aruba/compose.edge-auth-trial.yaml: overrides the gateway Caddyfile and securely mounts a bcrypt hash from /opt/hollowgate/config/auth_trial_hash, via a Docker secret.
- deploy/aruba/compose.auth-trial.yaml: enables signup and reset only in the existing hollowgate_auth_test database and restricted app role; mounts the previously verified Resend key file as an API-only Docker secret.
- apps/aruba-auth-web/index.trial.html: removes the static-only marker so the existing browser app can use same-origin APIs. The read-only index.html remains unchanged.

**Do not enable until** the test DB has migrations 006 and 007, a backup is available, Caddy can validate the trial config with the hash secret, and operator-reviewed access protections are in place. The trial protects against unauthenticated public use but it does not yet provide a general public signup rate limiter: all visitors behind Caddy may share one upstream IP bucket, so only a single authorized tester should use this phase. Create the password and its bcrypt hash locally on the VPS; do not paste it in chat or commit it. The hash secret is a file outside the repository.

Only use disposable test email/credentials; never reuse a real Hollowgate or Supabase password. Successful registration can send a real Resend verification email; existing Supabase accounts remain untouched. Keep the main Vercel site and Supabase users unchanged. Returning to the safe default is accomplished by reapplying the original compose.edge-staging.yaml for Caddy, and the original compose.auth-staging.yaml for auth API.

Before deployment, perform an independent test of the reverse-proxy authorization boundary including 401 without Basic Auth and no public /auth/* leakage, no token in logs, cookie policies, origin checks, low-rate signup, and a monitored delivery test. Avoid automating this trial without an operator review.

## Password provisioning

Run bash deploy/aruba/scripts/prepare-auth-trial.sh in SSH. This script asks for a fresh 16+ character test password twice without echo, sends plaintext via stdin into the staging Node container for Argon2id hashing, and writes only a 0600 hash file at /opt/hollowgate/config/auth_trial_hash. Username is tester. Never paste password into chat or reuse real credentials.
