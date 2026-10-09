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
- Merged origin/main (f282fe7). checkout.html + test-wallet-seam.mjs/.sh:
  K1-K6 seam committed (48062b9). K3b normalisation amendment (peer review)
  applied and committed (50c07cb) — checkout.html's finish() and
  wallet-common.js's payWithWallet both now do
  `(buyerEmail||x).trim().toLowerCase()`, not just the fallback.
- assets/wallet-common.js (C1-C6) committed (83694a3): WALLETS all false;
  payWithWallet normalises email once, POSTs
  {plan,token,email,first_name,last_name,company,wallet}, calls
  finish(result,token,email) always. scripts/test-wallet-common.js: 20/20
  green, red-proven (file absent on origin/main).
- assets/wallet-paypal.js (P1-P5) committed (d2b2578): mounts one button
  into #wallets only from inside onReady(); switch checked once before
  registering onReady; token handler calls payWithWallet('paypal',
  token.id, {email,first_name:'',last_name:''}); error -> showError;
  cancel -> silent; PAYPAL_GATEWAY_CODE='' by default.
  scripts/test-wallet-paypal.sh/.mjs: 11/11 green, red-proven (neither
  wallet file nor #wallets exist on origin/main — FAILs then crashes).
- All four spec'd tests + all pre-existing worker tests re-run this
  segment, all green, no regression (test-subscribe-wallet.js,
  test-subscribe-build-purchase.js, test-decline-reasons.js all PASS).
- .assetsignore checked: no new line needed (scripts/ covered as a whole;
  assets/* is meant to be served).

- C3 amendment (overseer review, 2026-10-09) committed (41a5620):
  payWithWallet now reads #email/#first_name/#last_name as a fallback,
  only when the wallet itself reports nothing for that field — wallet's
  own value still wins when present. Refusal (no POST) still fires only
  when both sources are empty. 6 new checks added to
  scripts/test-wallet-common.js (wallet-wins-over-field for email and for
  names, field-as-fallback for email and for names normalised correctly,
  both-empty-still-refuses, no-third-argument-does-not-throw); proved red
  first against the pre-amendment committed file (3 of the 6 FAILed, as
  expected), green after the edit (27/27).
- Re-ran all four named suites plus every other scripts/test-*.sh|js in
  the repo this segment: test-wallet-seam.sh (30/30), test-wallet-common.js
  (27/27), test-wallet-paypal.sh (11/11), test-subscribe-wallet.js (17/17),
  test-subscribe-build-purchase.js, test-decline-reasons.js,
  test-subscribe-decline-alert.js worker.js raillog.js,
  test-subscribe-decline-email.js, test-raillog-alert.js,
  test-checkout-address.sh, test-ga4-events.sh — all green, no regression.
  test-subscribe-rate-limit.sh . expect-429 FAILed (six 501s, no 429) —
  unrelated to this change (spins up wrangler dev against /api/subscribe's
  rate limiter, untouched this segment; looks like a missing-secrets/
  environment gap in this worktree, not a regression) — flagged to the
  overseer, not fixed here, out of this task's scope.

Next:
1. Report the C3 amendment back to landing-opzichter via SendMessage:
   code + tests done (41a5620), red-proven, all four named suites +
   regression set green, the one unrelated rate-limit-suite environment
   gap flagged.
2. Then it is Martin's call to land, via the overseer — do not push to
   main from here.
3. scripts/test-subscribe-wallet.js's stray mode-bit-only change is
   already committed (d7ebe40, from the previous segment) — nothing left
   to do there.

Traps (with dates):
- 2026-10-09: Node's global `fetch`/`Response`/`btoa` (Node 26 here) used
  directly as vm sandbox globals in worker test scripts — works because
  worker.js's json() helper calls `new Response(...)` and signs Recurly
  calls with `btoa(...)`, both real Node globals.
- 2026-10-09: a worker.js test script that strips the leading `import` line
  must use `/gm`, not `/m` alone — a second top-level `import` (e.g. a
  merge adding `cloudflare:email`) otherwise survives and throws a
  SyntaxError.
- 2026-10-09: jsdom cannot do real `location.href=` navigation; the only
  working fix is monkeypatching
  `jsdom/lib/jsdom/living/window/navigation.js`'s `navigate` export via
  `createRequire`, before `require('jsdom')` itself (not just before
  `new JSDOM()`) — jsdom's Location class binds to navigate() on first
  load and keeps that reference.
- 2026-10-09: the K5 card-submit regression test must fill `state` and
  `postal_code` too — updateAddressRequirements() makes both required for
  the default country (US) on load.
- 2026-10-09: a vm-sandboxed test of payWithWallet's fetch().then().then()
  chain needs several microtask turns flushed (a loop of ~10
  `await Promise.resolve()`), not just one — one tick is not enough to
  reach the second `.then()`.
- 2026-10-09: email normalisation (trim+lowercase) must happen identically
  on every path that can produce the /welcome and localStorage email:
  checkout.html's finish() for both its buyerEmail argument and its #email
  fallback, and wallet-common.js's payWithWallet once up front — a buyer
  reporting the same address differently-cased must never get two Recurly
  accounts.
- 2026-10-09: a jsdom document fires its own real DOMContentLoaded once,
  asynchronously, even when every <script> was stripped out of the HTML
  and run by hand via window.eval — a test harness must never also
  dispatch one by hand, or a deferred wallet file's init() (which listens
  for that event) runs twice and double-mounts. Set any WALLETS.* switch
  the test needs synchronously, inside the function that ran the deferred
  scripts, before it returns — that is guaranteed to land before jsdom's
  own (later, async) DOMContentLoaded fires.
- 2026-10-09 (overseer review): `scripts/test-subscribe-rate-limit.sh`
  hard-codes `PORT=8799`, so it is not re-runnable while more than one
  session in this repo can run it — a `FAIL (six 501s, no 429)` seen this
  segment was another session's `wrangler dev` already holding that port,
  not an environment gap. Worse: its `cleanup()` runs `pkill -f "wrangler
  dev --port 8799"` then `kill -9` on whatever still holds the port, so
  running it can kill a *different* session's dev server as collateral,
  failing that session's own test for no visible reason. Don't run it
  while another worktree's session might be using port 8799; fixing the
  script itself (a free/random port per run) is its own task, not this
  one's.
- 2026-10-09 (overseer review): `sendDeclineAlertEmail` (worker.js) still
  carries only plan/code/gateway_error_code, with no `wallet=` field,
  even though `logDecline` carries one now. Logged by the overseer as an
  open gap on worker.md, not this branch's to fix — it touches the
  decline path, which this task must not regress.
