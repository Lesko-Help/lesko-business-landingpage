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

1. **C4, payment_type attribution (overseer review, 2026-10-12).** Spec C4 as
   drafted assumed GA4 invents a default label ("Credit Card") for an
   `add_payment_info` event that omits `payment_type`, so only the wallet
   path was meant to set it. GA4 does no such thing — it just omits the
   parameter — so a card purchase would have been merely blank, not told
   apart from a wallet's own label. Fixed in code instead of weakening C4:
   checkout.html's own card-path event now sends `payment_type: 'Credit
   Card'` explicitly. Spec should say both paths always set `payment_type`,
   not just the wallet one.
2. **Card-only 3-D Secure retry (overseer review, 2026-10-12).** checkout.html's
   `subscribe(tokenId, threeDSResultId)` is also the function the bank's 3-D
   Secure challenge calls a second time with its result token. It always
   re-reads `#email`/`#first_name`/`#last_name` and posts no `wallet` field,
   so a wallet purchase that triggered a 3-D Secure challenge would be
   resubmitted shaped like a card purchase. Not fixed here (behaviour
   unchanged, comment only) — whether any wallet SDK on this site can even
   trigger that challenge is unverified, with no live wallet-capable gateway
   to test against. Spec K3/K-seam should say explicitly whether the 3-D
   Secure retry is in scope for a wallet purchase, and if so, what it posts.
3. **assets/flow.css has no `.wallets` rule.** `#wallets` is an empty `<div>`
   today (every `WALLETS.*` flag ships `false`), so the missing rule is
   harmless — zero children, zero height, nothing laid out. It becomes a
   real gap the moment any wallet switch flips true: the button(s) built by
   wallet-paypal.js/wallet-google-pay.js/wallet-apple-pay.js would mount with
   no spacing/sizing rule at all. Not fixed here (flow.css is out of scope
   for this task); spec should name which worktree (likely whichever one
   first flips a switch live) owns adding it.

## State

Done (landed, all committed through 4640f23): K1-K6 seam, C1-C6
wallet-common.js, P1-P5 wallet-paypal.js, the C3 amendment (wallet-first
then page field), and the port-collision/decline-email trap notes.
`wt-done.sh --check` was clean. Martin said "land it" — then `a2dbb02` on
main turned on a real review gate, which caught this branch (first one
it has caught) for having no `## Agentic review` Verdict line. Overseer
re-reviewed properly and sent CHANGES REQUESTED, 2026-10-12: one blocker
plus five should-fix items plus three nits. Overseer owns and fills
`## Agentic review` / `Verdict:` itself — never write that section.

In flight, this round (uncommitted):
- [BLOCKER] checkout.html: moved `markReady();` from before
  `recurly.Elements()`/`card.attach()` to the very end of setupCard(), and
  wrapped each `cb()` inside markReady()'s forEach in try/catch — done.
- [BLOCKER] assets/wallet-paypal.js: rewritten — whole file wrapped in an
  IIFE (was fixing the SHOULD-FIX global-leak item at the same time);
  `window.recurly.PayPal(...)` now in try/catch, on throw removes the
  button and shows nothing (G4/A4 silent-unavailable shape); fixed the
  self-contradicting "checked again inside onReady" comment — done.
- Still to do:
  1. New red-first test in scripts/test-wallet-paypal.mjs: WALLETS.paypal
     = true + a throwing recurly.PayPal stub => card.attach still called
     with '#recurly-card', no button mounted. Scratch copy of pre-fix HEAD
     already archived at
     .claude/worktrees/wallet-paypal/../../scratchpad/pre-blocker-fix
     (session scratchpad, see path in shell history) — run the new test
     against it first (must FAIL), then against the working tree (must
     PASS), per the overseer's explicit ask to show both runs.
  2. SHOULD-FIX C4: checkout.html's card add_payment_info event needs
     `payment_type: 'Credit Card'` added; fix the untrue comment in
     wallet-common.js:58-60 ("GA4 reads as its default" — it doesn't);
     add a scripts/test-ga4-events.sh check that both events carry a
     payment_type.
  3. SHOULD-FIX: comment at the 3DS retry seam (checkout.html ~408-423)
     saying it is card-only and why (no `wallet` field, re-reads
     #email/#first_name/#last_name) — do NOT change the behaviour, log it
     under this brief's Spec proposals too (overseer records the spec
     side separately).
  4. Fill in this brief's own Spec proposals section (currently empty):
     the C4/payment_type deviation, the card-only 3DS retry, and
     assets/flow.css having no `.wallets` rule (harmless now, empty div,
     but unstyled once a switch flips — do not touch flow.css here).
  5. NITS (judgement, do them — cheap and correct): wallet-common.js
     trim() each source before choosing between wallet/field, so a
     whitespace-only wallet email can't beat a good page field and then
     still refuse; drop scripts/test-wallet-common.js's
     `isOn('paypal') === WALLETS.paypal` check (reads its expectation off
     the system under test); scripts/test-subscribe-wallet.js's
     wallet:'bitcoin' case should also assert the "Unknown payment
     method." message, not just status 400.
  6. Re-run every suite (all four named + every other scripts/test-*,
     EXCEPT test-subscribe-rate-limit.sh — port 8799 collision risk,
     already a Trap below) plus both red/green runs of the new blocker
     test, then report to landing-opzichter and stop. Overseer fills the
     Verdict and lands; never push to main from here.

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
