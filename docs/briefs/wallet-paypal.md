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
- worker.js wallet branch + scripts/test-subscribe-wallet.js: committed
  (1478738), proven red (7 fails) against origin/main's old worker.js and
  green against this branch; pre-existing worker tests re-run clean.
  SUPERSEDED BY THE MERGE BELOW — origin/main has since changed worker.js's
  logDecline() too (alert-on-decline, landed as 677f220/020d83d/f34be49);
  resolving that is the immediate next step, not done yet.
- checkout.html (K1-K5 seam) + scripts/test-wallet-seam.sh/.mjs: written and
  now green (`bash scripts/test-wallet-seam.sh .` all PASS), but NOT
  committed — holding per the overseer's instruction below. Getting it green
  needed three fixes beyond the first draft, kept here since they are not
  obvious from the diff alone: (a) loadCheckout() must skip `defer` script
  tags entirely (assets/wallet-common.js and wallet-paypal.js do not exist
  in this worktree yet, and never need to run for K1-K5 anyway); (b) jsdom
  does not implement `location.href = ...` navigation at all — it silently
  no-ops rather than updating `location.href` — so proving K3's redirect
  requires monkeypatching jsdom's own internal
  `jsdom/lib/jsdom/living/window/navigation.js` navigate() export to record
  the attempted URL, and that patch must land before jsdom's `Location`
  class is first loaded, i.e. before `require('jsdom')` itself, not just
  before `new JSDOM()`; (c) the K5 card-submit regression must fill `state`
  and `postal_code` too, not just the other five fields — checkout.html's
  own updateAddressRequirements() makes both required for the default
  country (US) on load.
- In writing this test myself (before the overseer's message arrived) I
  independently hit the same bug the overseer flagged as 2(b): finish()
  reads the redirect email from the `#email` DOM field, not from
  `result.account_code`, so a wallet purchase (which never types there)
  would redirect to `/welcome?email=&plan=...`. My test originally asserted
  the spec's (wrong) example; I have NOT changed that assertion or
  checkout.html's finish() — holding both for the amended spec, per below.

HOLDING, per landing-opzichter's message (2026-10-09, via SendMessage):
  two errors in the K3 spec I'm building to — finish() takes
  (result, tokenId) not (result), and finish()'s success path needs to get
  the email from result.account_code for a wallet purchase instead of the
  (empty, for a wallet) #email field — plus a new onReady(callback) being
  added to the seam so a wallet mounts only after recurly.configure()
  succeeds. The overseer is amending docs/specs/modules/wallets.md and will
  send the amended K/C sections. Do NOT guess the fix or commit
  checkout.html/test-wallet-seam.* until that arrives.
  Also told: wallet-google-pay (branch wallet-google-pay, HEAD 8a5755f,
  parked) shipped its own assets/wallet-common.js + its own #wallets row in
  a different spot (above #cardField, bare div, no class) because this
  worktree had landed nothing when it started. My placement (class="wallets"
  above #payMsg in the summary panel) is the one that lands; it drops its
  own copy when I land. Not my action item beyond knowing this.
  Also noted (not my task): worker.js reads
  err.three_d_secure_action_token_id but Recurly v3 nests it under
  error.transaction_error, so the 3DS branch can never fire today — a
  separate, already-logged defect, not touched here.

In flight (file:line):
- Merging origin/main (fetched: f34be49, five briefs ahead of this branch's
  a55c994 base). worker.js conflict is real: origin/main's alert-on-decline
  added sendDeclineAlertEmail() + a Cloudflare send_email binding inside/
  around logDecline(); this branch changed logDecline()'s signature to take
  a 3rd `wallet` arg. Have fetched; have NOT yet run `git merge origin/main`
  or touched the conflict. Do that next, keeping both: the decline email
  still fires AND the alert line still appends ` wallet=<method|card>`.
  After resolving, re-run scripts/test-subscribe-wallet.js AND the landed
  scripts/test-subscribe-decline-email.js — both must be green before
  moving on.

Next:
1. `git merge origin/main`, resolve worker.js's logDecline() conflict
   (keep both the email send and the wallet arg), re-run
   test-subscribe-wallet.js and test-subscribe-decline-email.js green.
2. Reply to landing-opzichter (SendMessage) with where the merge landed.
3. Wait for the amended K/C sections of docs/specs/modules/wallets.md
   before touching checkout.html, test-wallet-seam.*, or starting
   assets/wallet-common.js / wallet-paypal.js.
4. Once the amendment arrives: fix checkout.html's finish() (account_code
   over the #email field, per the amendment's actual wording — do not
   reuse my own guess above, re-read what the overseer actually sends),
   add onReady() to the seam, re-run test-wallet-seam.sh red/green, then
   commit checkout.html + the seam test as one commit.
5. Write assets/wallet-common.js (C1-C6) + scripts/test-wallet-common.js,
   then assets/wallet-paypal.js (P1-P5) + scripts/test-wallet-paypal.sh —
   neither started.
6. Check .assetsignore once all new files exist (scripts/ already covered
   as a whole; assets/ already served — likely no new line needed).
7. Run wt-done.sh --check wallet-paypal until it exits 0, report done to
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
- 2026-10-09: jsdom cannot do real `location.href=` navigation (logs "Not
  implemented" and leaves location unchanged) and most of its DOM objects'
  properties are non-configurable, so there is no way to intercept this
  from outside jsdom's own code. The only working fix found: monkeypatch
  `jsdom/lib/jsdom/living/window/navigation.js`'s exported `navigate`
  function via `createRequire`, and do it before `require('jsdom')` itself
  (not just before `new JSDOM()`) — jsdom's Location class binds to
  navigate() the first time it loads and keeps that reference, so patching
  any later is silently a no-op.
