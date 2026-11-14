# Aruba authentication preview — static, not live

This is a **visual-only** Italian browser preview. The staging Caddy edge serves only the five explicit pages (/login, /signup, /forgot-password, /account/password, /account/verify-email) and three allowlisted assets (/auth-ui/app.mjs, /auth-ui/flow.mjs, /auth-ui/styles.css).

No form sends data: the HTML meta marker "hollowgate-preview=static-only" blocks constructing the API client and blocks form submission, while the Content-Security-Policy also sets connect-src 'none' and form-action 'none'. The preview is publicly viewable only on the staging subdomain after operator deployment, with noindex and no-store headers. The /auth/* route remains the existing 404; diagnostic /health and /ready continue working. Neither the production Vercel site nor Supabase are modified.

Deployment (only after CI succeeds; from /opt/hollowgate/aruba-source):
1. git pull --ff-only origin feature/aruba-api-foundation
2. sudo chmod a+r apps/aruba-auth-web/index.html apps/aruba-auth-web/app.mjs apps/aruba-auth-web/flow.mjs apps/aruba-auth-web/styles.css
3. sudo docker compose -f deploy/aruba/compose.edge-staging.yaml config --quiet
4. sudo docker compose -f deploy/aruba/compose.edge-staging.yaml run --rm --no-deps --entrypoint caddy caddy validate --config /etc/caddy/Caddyfile
5. sudo docker compose -f deploy/aruba/compose.edge-staging.yaml up -d --no-deps caddy

Verify HTTPS /login, /signup, /forgot-password and static assets return 200; /auth/signup remains 404, and /health remains 200. Do NOT activate AUTH_SIGNUP_ENABLED or AUTH_PASSWORD_RESET_ENABLED for the preview.

The real connected staging workflow requires a separate, security-reviewed change: Caddy exposure controls, application-level per-client rate limiting, safe Resend secret mount, browser session handling, and disposable live email round trip. Do not reuse real Hollowgate credentials on this static preview.
