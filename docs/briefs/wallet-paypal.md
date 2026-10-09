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
- Merged origin/main (f34be49) into this branch as f282fe7. Resolved
  worker.js's two conflicts by keeping both sides: logDecline(plan, te,
  wallet) still appends ` wallet=<method|card>`, and
  sendDeclineAlertEmail()/ctx.waitUntil()/the cloudflare:email import all
  still fire too. scripts/test-subscribe-wallet.js needed its own fix
  (5860469): its import-stripping regex only stripped worker.js's first
  `import` line, and the merge gave worker.js a second one
  (`cloudflare:email`) — added the `/gm` flag, matching the fix already
  landed in the other worker test scripts. Both
  scripts/test-subscribe-wallet.js and the landed
  scripts/test-subscribe-decline-email.js are green against the merged
  worker.js, as are the three pre-existing worker tests (decline-reasons,
  subscribe-build-purchase, subscribe-decline-alert) — no regression.
- Re-read docs/specs/modules/wallets.md directly (not just the relayed
  message) for the amended K3/K3a/K3b/K6/C2 wording. One correction over
  what I'd written here before: there is no `result.account_code` anywhere
  in the pinned spec or in Recurly's answer — the fix is purely the third
  `buyerEmail` argument, landing-opzichter said so explicitly after seeing
  my first version of this section.
- checkout.html: added `onReady(callback)` (fires once `recurly.configure()`
  inside setupCard() has run, immediately if it already has, queued
  otherwise); `finish()` now takes `(result, tokenId, buyerEmail)` and reads
  `(buyerEmail || email.value...)` on the success path, passing buyerEmail
  through the 3DS retry too so a wallet buyer's email survives a bank
  challenge. `window.LeskoCheckout` now publishes six functions (added
  `onReady`). K3a needed no code change beyond the new parameter — the
  card path's own `tokenId` closure was already correct; the risk was a
  future wallet caller, now covered by a test.
- scripts/test-wallet-seam.mjs: extended to prove K3a (3DS retry re-submits
  the given tokenId, not undefined — stubs `recurly.Risk().ThreeDSecure()`
  and a fetch spy on `/api/subscribe`, fires the stub's `token` handler by
  hand), K3b (`finish({ok:true},'tok-1','w@b.co')` with the card `#email`
  box empty puts `w%40b.co` in both the `/welcome` URL and localStorage),
  and K6 (onReady does not fire before `configure()` runs, fires once it
  does having been queued, fires immediately when called after, never fires
  if `configure()` never runs). `bash scripts/test-wallet-seam.sh .` is all
  PASS (27 checks). Proven red first against an `origin/main` scratch copy
  made with `git archive` (window.LeskoCheckout is undefined there, so the
  harness itself throws/fails well before any individual check could pass).
- checkout.html + scripts/test-wallet-seam.sh/.mjs are written and green but
  NOT YET COMMITTED — that is the very next step below, not done yet.

Next:
1. Commit checkout.html + scripts/test-wallet-seam.sh/.mjs together as one
   commit (one idea: the K1-K6 seam, to spec as amended).
2. Reply to landing-opzichter (SendMessage) confirming the merge landed as
   f282fe7 and the seam now matches the amended K3a/K3b/K6 spec.
3. Write assets/wallet-common.js (C1-C6, including C2's
   `LeskoCheckout.finish(result, token, buyer.email)` with both extra
   arguments always) + scripts/test-wallet-common.js — not started.
4. Write assets/wallet-paypal.js (P1-P5 — mounts only inside `onReady`,
   per K6) + scripts/test-wallet-paypal.sh + its jsdom companion — not
   started.
5. Check .assetsignore once all new files exist (scripts/ already covered
   as a whole; assets/ already served — likely no new line needed).
6. Run wt-done.sh --check wallet-paypal until it exits 0, report done to
   landing-opzichter.

Traps (with dates):
- 2026-10-09: Node's global `fetch`/`Response`/`btoa` (Node 26 here) are
  used directly as vm sandbox globals in scripts/test-subscribe-wallet.js
  instead of stubs from a library — works because worker.js's `subscribe()`
  builds every answer with `new Response(...)` and signs Recurly calls with
  `btoa(...)`, both real Web APIs Node already provides globally.
- 2026-10-09: a worker.js test script that strips the leading `import` line
  to run the file as a plain vm script must use `/gm`, not `/m` alone — a
  second top-level `import` (added by a merge, e.g. `cloudflare:email`)
  otherwise survives into the vm script body and throws a SyntaxError.
- 2026-10-09: jsdom cannot do real `location.href=` navigation (logs "Not
  implemented" and leaves location unchanged) and most of its DOM objects'
  properties are non-configurable, so there is no way to intercept this
  from outside jsdom's own code. The only working fix found: monkeypatch
  `jsdom/lib/jsdom/living/window/navigation.js`'s exported `navigate`
  function via `createRequire`, and do it before `require('jsdom')` itself
  (not just before `new JSDOM()`) — jsdom's Location class binds to
  navigate() the first time it loads and keeps that reference, so patching
  any later is silently a no-op.
- 2026-10-09: the K5 card-submit regression test must fill `state` and
  `postal_code` too, not just the other five fields — checkout.html's own
  updateAddressRequirements() makes both required for the default country
  (US) on load.
