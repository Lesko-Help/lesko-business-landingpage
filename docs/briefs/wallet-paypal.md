# Brief: wallet-paypal

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Build the shared wallet seam and PayPal on /checkout, to spec. The spec is docs/specs/modules/wallets.md sections K1-K5 (the window.LeskoCheckout seam, published by checkout.html's existing inline functions), C1-C6 (assets/wallet-common.js: the one WALLETS switch and the single POST to /api/subscribe), P1-P5 (assets/wallet-paypal.js) and W1-W4 (the wallet branch in worker.js and buildPurchase). Read at `/Users/admin/Lesko/lesko-business-landingpage/docs/specs/modules/wallets.md` (overseer's main checkout, uncommitted pending Martin's approval as of 2026-10-09) — confirmed read. You own the seam; wallet-google-pay and wallet-apple-pay build on it, so keep the signatures exactly as the spec pins them. Ship with WALLETS.paypal = false - nothing may be reachable by a buyer, because the PayPal gateway on this Recurly site is the dead legacy one and Martin must add a PayPal Complete Payments gateway before any of this can be proven live. Write the four tests the spec names (scripts/test-wallet-seam.sh, scripts/test-wallet-common.js, scripts/test-wallet-paypal.sh, scripts/test-subscribe-wallet.js) and show each red first against origin/main. Add every new non-page file to .assetsignore except assets/*. Change no copy, no price, and nothing in index.html or welcome.html.

No memory-bank message from the overseer had arrived by the time this brief was committed (checked via ReadNotifications). If one arrives later it will be added here.

## Done when

All four named tests exist, each shown red against a scratch copy of
`origin/main` and green against this branch's working tree:
- `scripts/test-wallet-seam.sh .` (K1-K5, checkout.html's published seam)
- `node scripts/test-wallet-common.js assets/wallet-common.js` (C1-C6)
- `scripts/test-wallet-paypal.sh .` (P1-P5)
- `node scripts/test-subscribe-wallet.js worker.js` (W1-W3)
Plus the pre-existing worker.js tests (test-subscribe-build-purchase.js,
test-subscribe-decline-alert.js, test-decline-reasons.js) still pass
unchanged, proving no regression on the card path.

Spec: unchanged because this task only implements K1-K5/C1-C6/P1-P5/W1-W4
exactly as already drafted; nothing found needed changing (see Spec
proposals below for the one open question logged anyway).

## May touch

Module: wallets (docs/specs/modules/wallets.md) — the smallest thing that
deploys on its own is the whole `lesko-business-landingpage` Worker (one
push to main = one deploy), but the module boundary is wallets per
docs/specs/INDEX.md.
Files: `checkout.html` (add `#wallets` row + publish `window.LeskoCheckout`
only — no copy/price change), `assets/wallet-common.js` (new),
`assets/wallet-paypal.js` (new), `worker.js` (wallet branch in `subscribe()`
and `buildPurchase()`, per W1-W4), `scripts/test-wallet-seam.sh` +
`scripts/test-wallet-seam.mjs` (new), `scripts/test-wallet-common.js` (new),
`scripts/test-wallet-paypal.sh` + a jsdom companion (new),
`scripts/test-subscribe-wallet.js` (new), `.assetsignore` (only if a new
non-`assets/*` file needs listing — scripts/ is already covered as a whole).
Not touched: index.html, welcome.html, assets/flow.css, any copy or price.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — same as every change in this
repo. WALLETS.paypal ships `false`, so this lands with nothing reachable by
a buyer; no gateway or DNS work is implied by this branch itself.

## Context

Overseer's spec file (uncommitted, main, read 2026-10-09):
docs/specs/modules/wallets.md, sections K1-K5/C1-C6/P1-P5/W1-W4 (this
worktree's scope) plus G1-G5/A1-A5 (wallet-google-pay/wallet-apple-pay,
out of scope here — their worktrees build on this seam).
Decisions in that spec worth repeating here: all three wallets ship
`WALLETS.*=false` because the Recurly gateway behind this site cannot take
any of them live yet (Authorize.Net only; PayPal needs a new PayPal
Complete Payments gateway Martin has not added, checked 2026-10-09).

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Done:
- worker.js: wallet branch done and green. Added WALLET_METHODS const, `wallet`
  field parsed/validated in subscribe() (400 on unknown method, name check
  skipped when wallet present), buildPurchase() now omits first_name/last_name
  when empty instead of sending ''), logDecline() takes a 3rd `wallet` arg and
  appends ` wallet=<method|card>` to the alert line, call site passes `wallet`.
- scripts/test-subscribe-wallet.js: written, proven red against
  origin/main's worker.js (7 fails) and green against this branch's
  worker.js (all pass). Pre-existing worker tests
  (test-subscribe-build-purchase.js, test-subscribe-decline-alert.js,
  test-decline-reasons.js) re-run and still pass — no regression.
- checkout.html: added `<div class="wallets" id="wallets"></div>` above
  `#payMsg` in the summary panel; added two deferred `<script>` tags for
  `/assets/wallet-common.js` and `/assets/wallet-paypal.js` right after the
  Recurly.js `<script>` tag in `<head>`; added `window.LeskoCheckout = {
  plan, total, showError, finish, walletsRow }` inside the existing inline
  IIFE, right after `netFail()` is defined (so it exists before any
  deferred script runs, and closes over the IIFE's own `plan`/`P`/
  `showError`/`finish`). No copy, price or index.html/welcome.html touched.
- scripts/test-wallet-seam.sh + scripts/test-wallet-seam.mjs: written
  (K1-K5), self-contained jsdom harness (does not import
  test-checkout-address.mjs, duplicates the small bits of it needed).
  NOT YET RUN red/green — this is the very next step.

In flight (file:line):
- scripts/test-wallet-seam.mjs — just finished editing loadCheckout() to
  take an `options` object ({rewriteHtml, recurlyStub, configResponse})
  instead of a single `rewriteHtml` arg, and updated the K4 "missing
  #wallets row" call site and the K5 regression block to match. Have NOT
  yet run this test at all (neither red nor green). Do that next.

Next:
1. Run `scripts/test-wallet-seam.sh .` against this branch — fix until
   green (likely issues: the `elements` variable inside checkout.html's
   IIFE is closure-local, so K5's regression block relies on the normal
   fetch('/api/config') -> setupCard() chain via flushMicrotasks(), not a
   shortcut — double check that actually assigns `elements` before
   recurly.token() is reached).
2. Prove the same test red against a scratch copy of origin/main's
   checkout.html (`git show origin/main:checkout.html` into a scratch dir
   alongside origin/main's assets/flow.css — window.LeskoCheckout should be
   undefined there).
3. Write assets/wallet-common.js (C1-C6) and its test
   scripts/test-wallet-common.js — not started yet.
4. Write assets/wallet-paypal.js (P1-P5) and
   scripts/test-wallet-paypal.sh (+ jsdom companion) — not started yet.
5. Check .assetsignore: scripts/ as a whole is already ignored and assets/
   is already served, so the new files likely need NO new line — confirm
   once all new files exist, don't add speculatively.
6. Merge origin/main, run wt-done.sh --check wallet-paypal, report to
   landing-opzichter.

Traps (with dates):
- 2026-10-09: Node's global `fetch`/`Response`/`btoa` (Node 26 here) are
  used directly as vm sandbox globals in scripts/test-subscribe-wallet.js
  instead of stubs from a library — works because worker.js's `subscribe()`
  builds every answer with `new Response(...)` and signs Recurly calls with
  `btoa(...)`, both real Web APIs Node already provides globally.
- 2026-10-09: test-checkout-address.mjs's jsdom harness pattern (strip
  `<script>` tags by regex, run each by hand via `window.eval`, because
  jsdom does not fetch local file `src`s) is the template reused for
  test-wallet-seam.mjs — but reimplemented standalone rather than imported,
  so each test script still runs against a bare scratch copy of the repo
  made with `git archive` that may carry only itself.
