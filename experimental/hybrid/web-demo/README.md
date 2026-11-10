# Browser proof of concept — WebRTC Hybrid

A new standalone, static browser interface for the GM and up to multiple players.
The GM opens the page, starts a synthetic campaign and shares manually
the WebRTC answer; players create an offer and paste the answer. The
encrypted data channel carries rolls, notes and token movement. This
does **not** use Supabase, actual Hollowgate credentials, production databases,
external cloud storage or persisted Hub state.

## Test procedure
1. Open **two browsers**, ideally on two different machines.
2. GM clicks «Sono il GM» → «Avvia / riprendi».
3. Player clicks «Sono un giocatore» → «Genera richiesta».
4. Player copies the offer to GM; GM pastes it and generates an answer.
5. GM copies the answer to player; player pastes it and clicks «Completa».
6. Test roll d20, movement and public notes. GM private notes must not
   be sent in the player's snapshot.
7. GM refreshes; local browser save should remain, but players need
   to reconnect because sessions are ephemeral.

No TURN server exists; NAT/firewalls can prevent connections across
some networks. Manual offer/answer is only temporary signaling until
Hollowgate Hub is ready. The GM's browser must remain open, and browser
storage can be cleared: this is not a production-ready file-backed host.
Identity is a synthetic, per-connection temporary ID; any person with the
manually exchanged offer can become a player. Use only test data.

## Important distinction
This demo is a functional direct peer connection **not** the Node.js GM Host
or the future centralized Hub. A separate Vercel preview can host the
static UI, without merging or redeploying the main Hollowgate application.

Run static contract checks with
`node --test experimental/hybrid/web-demo/demo.test.mjs`.
