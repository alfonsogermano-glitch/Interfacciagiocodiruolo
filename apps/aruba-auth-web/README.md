# Hollowgate Aruba Authentication UI (NOT DEPLOYED)

Italian dependency-free browser frontend under apps/aruba-auth-web, separate from the existing React Vercel site. Pages are /login, /signup, /forgot-password, /account/password?action=password_reset&token=..., /account/verify-email?token=... . Form fields match dedicated test API.

All requests use current secure origin with same-origin cookies, cache no-store and redirects disabled. Links do not auto-consume tokens; explicit user interaction is required to prevent email scanners from exhausting the verification link. The script removes token-bearing query parameters from the address bar before rendering, does not store credentials or tokens in Web Storage or log them, and does not redirect staging sessions into the production VTT.

Use Node 24: node --test apps/aruba-auth-web/test/*.test.mjs

The HTML expects scripts/styles under /auth-ui/ and the same page for the listed URLs; the Caddy staging edge does NOT yet serve these files or forward public auth routes. Before a public test: verify trusted proxy client IP handling, credentialed origin boundaries, rate limiting and CSP; mount Resend key as a Docker secret; ensure migration 007 applies to test DB only; conduct a real browser/Postgres/Resend trial with disposable users. Leave main and live Supabase users untouched.
