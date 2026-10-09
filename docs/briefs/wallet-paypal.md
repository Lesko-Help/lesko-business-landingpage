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
- Merged origin/main (f282fe7) and fixed scripts/test-subscribe-wallet.js's
  import-stripping (5860469). All pre-existing + new worker tests green,
  no regression.
- checkout.html + scripts/test-wallet-seam.mjs/.sh: K1-K6 seam committed
  (48062b9) — onReady/markReady, finish(result, tokenId, buyerEmail) with
  the card-field fallback, both threaded through the 3DS retry. 27 checks
  green, proven red against an origin/main scratch copy first.
- K3b amendment (landing-opzichter, after reviewing wallet-google-pay
  round 2): email normalisation (trim+lowercase) must apply to BOTH the
  buyerEmail argument and the #email fallback, not just the fallback.
  checkout.html:435 now `var e = (buyerEmail || email.value).trim().toLowerCase();`
  — fixed, not yet committed. Added two seam tests (padded/upper-case
  wallet email -> lower-cased, trimmed in both the /welcome URL and
  localStorage) to scripts/test-wallet-seam.mjs, green but not committed.
- assets/wallet-common.js written (C1-C6): WALLETS={paypal:false,
  apple_pay:false,google_pay:false}; payWithWallet normalises
  buyer.email once (trim+lowercase) before the C3 empty check, the GA4
  event, the POST body and finish(); POSTs
  {plan,token,email,first_name,last_name,company,wallet} to
  /api/subscribe (company read straight off the page's #company field,
  since no wallet reports it); calls finish(result, token, email) always
  with both extra args. scripts/test-wallet-common.js written and green
  (20 checks, incl. the normalisation amendment) — NOT YET COMMITTED.
  Red-proof: the file does not exist on origin/main at all (git show
  origin/main:assets/wallet-common.js fails), so the test cannot even
  load it there.

Next:
1. Commit assets/wallet-common.js + scripts/test-wallet-common.js as one
   commit (C1-C6), and the checkout.html K3b-normalisation fix +
   scripts/test-wallet-seam.mjs amendment as a separate commit (one idea
   each) — neither committed yet.
2. Write assets/wallet-paypal.js (P1-P5 — mounts only inside `onReady`,
   per K6; PAYPAL_GATEWAY_CODE constant, empty) + scripts/test-wallet-paypal.sh
   + its jsdom companion — not started. P3's payWithWallet call passes
   empty first_name/last_name (PayPal's token carries no reliable name).
3. Check .assetsignore once all new files exist (scripts/ already covered
   as a whole; assets/ already served — likely no new line needed).
4. Run wt-done.sh --check wallet-paypal until it exits 0.
5. Reply to landing-opzichter (SendMessage): merge landed as f282fe7, K1-K6
   seam committed as 48062b9, K3b normalisation amendment applied, C1-C6
   wallet-common.js written — then report full completion once P1-P5 lands
   too.

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
