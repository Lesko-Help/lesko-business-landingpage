# Brief: wallet-google-pay

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Build Google Pay on /checkout, to spec: docs/specs/modules/wallets.md sections G1-G5. IT IS NOT COMMITTED YET: read it at /Users/admin/Lesko/lesko-business-landingpage/docs/specs/modules/wallets.md (overseer folder, branch main, uncommitted pending Martin's approval). You do NOT own the seam: K1-K5 (window.LeskoCheckout), C1-C6 (assets/wallet-common.js) and W1-W4 (the worker wallet branch) belong to branch wallet-paypal. Before writing anything, git fetch and check whether wallet-paypal has landed on origin/main; if it has, rebase onto it and build only assets/wallet-google-pay.js plus its one script tag. If it has not, write only the seam parts you actually need, exactly as the spec pins the signatures, and tell the overseer so it keeps one copy at landing. Ship with WALLETS.google_pay = false and GOOGLE_MERCHANT_ID = '' - nothing may be reachable by a buyer, because Recurly here is Authorize.Net-only, Recurly does not list it as a Google Pay gateway, and Google Pay also needs a merchant id and 3-D Secure on the gateway, all of which are Martin's to arrange. Write scripts/test-wallet-google-pay.sh and show it red first against origin/main. Change no copy, no price, and nothing in index.html or welcome.html.

## Done when

`scripts/test-wallet-google-pay.sh .` passes (0 exit), proving G1-G5 of
`docs/specs/modules/wallets.md`: the button mounts only with the switch on
*and* a non-empty `GOOGLE_MERCHANT_ID` (G1); when it mounts, `recurly.GooglePay()`
gets `currency/country/total/googleMerchantId/billingAddressRequired/requireEmail`
exactly as the spec writes them, `total` matching the active plan's price
(G2); its `token` event calls `payWithWallet('google_pay', token.id, buyer)`
with email/first/last name each defaulting to `''` (G3); a throwing
`GooglePay()`, a missing `window.PaymentRequest`, or its own `error` event
all leave `#wallets` empty/button removed and the card path untouched (G4);
`GOOGLE_MERCHANT_ID` is the one constant at the top of the file, empty as
shipped (G5). Proven red first against `origin/main` (git archive, scratch
dir — neither `assets/wallet-google-pay.js` nor the test exists there), then
green on this branch.

Spec: unchanged because the task matches G1-G5 and the already-pinned seam
signatures (K1-K5, C1-C6) exactly; nothing needed clarifying or diverging
from what `docs/specs/modules/wallets.md` already says.

## May touch

Module: `wallets` (`docs/specs/modules/wallets.md`).
Files: `assets/wallet-google-pay.js` (new, owned by this task), plus the
seam this task depends on but does not own — `assets/wallet-common.js`
(new) and the `window.LeskoCheckout` publish + `#wallets` row in
`checkout.html` — written only because branch `wallet-paypal`, which owns
K1-K5/C1-C6/W1-W4, had landed zero commits on `main` as of 2026-10-09 (see
Context). Also `scripts/test-wallet-google-pay.sh` and `.mjs` (new). Not
touched: `index.html`, `welcome.html`, `worker.js` (the W1-W4 wallet branch
is not needed — nothing is reachable with the switch off and the merchant id
empty, and no test here calls the real `/api/subscribe`), any copy or price,
`docs/specs/`.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — the `wallets` module's own
deploy. Nothing becomes reachable by a buyer: `WALLETS.google_pay = false`
and `GOOGLE_MERCHANT_ID = ''` ship exactly as the brief's Goal requires.

## Context

- 2026-10-09: `wallet-paypal` branch exists (worktree +, tmux window of the
  same name) but had 0 commits ahead of `main` when this task started —
  checked with `git rev-list main..wallet-paypal --count`. It owns K1-K5
  (`window.LeskoCheckout`), C1-C6 (`assets/wallet-common.js`) and W1-W4 (the
  worker wallet branch) per `docs/specs/modules/wallets.md`. Since it had not
  landed, this task wrote the seam parts it actually needed (the
  `LeskoCheckout` publish in `checkout.html`, and a full `assets/wallet-common.js`)
  itself, built exactly to the spec's pinned signatures — **tell the overseer
  to keep only one copy of each at landing**, whichever branch lands second
  should drop its own copy if `wallet-paypal`'s differs, or confirm they
  match if not.
- 2026-10-09: the overseer's memory-bank message with prior context for this
  goal had not arrived by the time this brief was first committed. None has
  arrived since either; this task proceeded on the brief's own Goal text and
  the spec alone.
- 2026-10-09: the exact JS field names Google/Recurly return for a wallet
  sheet's billing contact are not pinned anywhere (the spec only says
  "billing contact", no field names). This task reads them off the token
  object directly — `token.email`, `token.firstName`, `token.lastName` — to
  match the already-pinned PayPal example (P3: `{email: token.email, ...}`,
  top-level, not nested). Not a spec conflict, just an implementation choice
  this task owns; noted here in case Martin's real Recurly integration later
  turns out to nest these differently (then only `wallet-google-pay.js`'s
  `token` handler needs changing, nothing else).

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Done:
- Brief filled in (Goal was already written by the overseer; done-when, may
  touch, deploy, context filled in here).
- `assets/wallet-common.js` written (C1-C6: the `WALLETS` switch, `isOn`,
  `payWithWallet`) — the seam piece `wallet-paypal` owns but had not landed.
- `checkout.html`: `window.LeskoCheckout` published (K1-K4, functions
  assigned unchanged per K5), `#wallets` row added to the payment panel,
  `<script defer>` tags added for `wallet-common.js` and
  `wallet-google-pay.js`.
- `assets/wallet-google-pay.js` written (G1-G5).
- `scripts/test-wallet-google-pay.sh` + `.mjs` written; confirmed red
  against `origin/main` via `git archive origin/main | tar -x -C <scratch>`
  (no wallet files exist there at all). Committed `919f050`; chmod 755 fix
  for the `.sh` committed alone `6013b4c`.
- Round 1 review (overseer): build faithful to G1-G5, but found an ordering
  defect (wallet file mounted on `DOMContentLoaded`, before `checkout.html`
  calls `recurly.configure()` — throws, silently swallowed by G4's own
  try/catch) and two spec errors in `finish()` not mine to fix. Told to
  stay parked; did, plus the chmod fix.
- Round 2 (amended spec, K6/K3a/K3b/C2): implemented the fix for the
  ordering defect on my own files, and matched my copy of the seam exactly
  to the amended spec text (the seam itself — `checkout.html`'s `onReady`
  and `finish` — is `wallet-paypal`'s to land; mine is a copy, dropped at
  landing if it differs):
  - `checkout.html`: added `onReady(callback)`/`fireReady()`, called from
    `setupCard()` once `recurly.configure()` has run; `finish(result,
    tokenId, buyerEmail)` — buyerEmail threads through the 3DS retry
    recursion, falls back to the card form's `#email` input when absent
    (unchanged behaviour for the card path); `window.LeskoCheckout` now
    also publishes `onReady`.
  - `assets/wallet-common.js`: `payWithWallet`'s success handler now calls
    `checkout.finish(result, token, email)` (3 args, always).
  - `assets/wallet-google-pay.js`: mounts via
    `window.LeskoCheckout.onReady(init)`, not `DOMContentLoaded`.
  - `scripts/test-wallet-google-pay.mjs`: rewritten — `extractScripts` now
    tracks `defer` per script, `loadCheckout` runs non-deferred scripts
    before deferred ones (matches real browser order; needed because
    `wallet-google-pay.js`, deferred, now calls `window.LeskoCheckout`
    synchronously at load time, defined by checkout.html's own non-deferred
    inline script later in the markup); added `flushMicrotasks()` (10x
    `await Promise.resolve()`, same convention as
    `test-checkout-address.mjs`); `recurlyStub` now always includes
    `configure`/`Elements`/`CardElement` no-ops; added two new checks for
    K6 (no mount before `onReady` fires, mounts once it does) and
    K3a/K3b (`finish` called with exactly `(result, tokenId, buyerEmail)`,
    the email being the wallet's own, not the empty card-form field).

In flight: none. Round 2 proven red against `origin/main` (same crash as
Round 1 — `origin/main` has no `#wallets` at all) then green here, 44/44
checks. Re-ran `test-checkout-address.sh .` (26/26 PASS) and
`test-ga4-events.sh .` (ALL PASS) against the edited `checkout.html` — no
regression from the seam changes. Not yet committed, not yet merged with
`origin/main` (overseer's heads-up: now at `f34be49`, worker.js changed,
unrelated to this branch's files), not yet reported to the overseer.

Next: commit this brief update, then the implementation changes
(`checkout.html`, `assets/wallet-common.js`, `assets/wallet-google-pay.js`)
and the test extension (`scripts/test-wallet-google-pay.mjs`) as separate
commits; merge `origin/main`; run `wt-done.sh --check`; report Round 2 to
the overseer. Not landing anything — that is Martin's call.

Traps (with dates):
- 2026-10-09: `wallet-paypal` branch/worktree exists but had landed nothing
  on `main` (0 commits ahead) when this task started — checked with
  `git rev-list main..wallet-paypal --count`. If it lands its own
  `assets/wallet-common.js` / `LeskoCheckout` seam after this branch lands,
  the overseer must dedupe (two copies of the same files would silently
  overwrite each other depending on merge order).
- 2026-10-09: jsdom does not implement `window.PaymentRequest`; the test
  sets it manually (`opts.hasPaymentRequest !== false`) and the shipped
  `wallet-google-pay.js` checks for it explicitly (G4) before ever calling
  `recurly.GooglePay()`.
- 2026-10-09: `wallet-paypal` has its own uncommitted `checkout.html` seam
  + `wallet-common.js`, with `#wallets` placed differently (summary panel,
  `class="wallets"`, above `#payMsg`) than this branch (payment panel, bare
  `<div id="wallets">`, above `#cardField`). Overseer is deciding placement
  for both branches — not mine to change unilaterally.
- 2026-10-09: the seam (`onReady` in `checkout.html`, the `finish` 3-arg
  signature) is `wallet-paypal`'s file to land; this branch holds a copy
  that must match the amended spec exactly, since a mismatch at landing
  means this branch's copy is the one dropped.
