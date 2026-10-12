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

## Agentic review

### Verdict
Verdict: pass — second round. The first round was changes requested (one
blocker, five should-fix, three nits); everything is fixed, and the overseer
re-ran and re-proved it rather than taking the worker's word.

Reviewed by the overseer (window 1) on 2026-10-12 against `origin/main` at
`f34be49`, with `git add -N .` first and `git diff origin/main...HEAD`: 12
files, +1525/-17, tree clean. 185 checks across 11 suites, 0 FAIL, run by the
overseer itself on the final committed tree. `test-subscribe-rate-limit.sh`
was deliberately not run — see the trap below; it cannot be trusted at the
moment and no branch is judged on it.

### Findings

Round one (2026-10-12), from the review subagent, each confirmed in the
source by the overseer before being sent:

- **BLOCKER — a silent card-checkout outage, armed by the switch meant to
  take PayPal live.** `checkout.html` called `markReady()` *before*
  `recurly.Elements()` and `card.attach('#recurly-card')`, so every
  `onReady` callback ran synchronously ahead of the card field.
  `wallet-paypal.js` called `window.recurly.PayPal({gatewayCode: ''})` with
  no `try`/`catch`, and the `fetch('/api/config')` chain ends in an empty
  `.catch`. With `WALLETS.paypal = true` the throw — which is the *expected*
  case on this site, whose only PayPal gateway is the dead legacy one — meant
  `card.attach` was never reached: Pay permanently answered "The secure card
  field is not ready", and nothing was logged anywhere. The seam the other
  two wallet worktrees copy.
- Should fix: `wallet-common.js` claimed in a comment that GA4 reads a
  missing `payment_type` as "Credit Card". It does not, and
  `checkout.html`'s card event sent none at all — so spec C4's comparison
  did not exist: wallets would have been labelled and cards left blank.
- Should fix: `PAYPAL_GATEWAY_CODE` and `init` were top-level globals in a
  classic script, so the next wallet file would overwrite `window.init`.
- Should fix: a comment in `wallet-paypal.js` contradicted itself inside one
  sentence about how often the switch is checked.
- Should fix: the 3-D Secure retry is card-only (no `wallet` field, re-reads
  `#email`/`#first_name`/`#last_name`), so a wallet buyer who typed no name
  would meet the Worker's 400 at the moment the bank approved, on a
  single-use token. Behaviour deliberately **not** changed here.
- Should fix: "Done when" pointed at a Spec proposals section that was empty.
- Nits: trim each source before choosing between wallet and page field;
  `test-wallet-common.js` asserted `isOn('paypal') === WALLETS.paypal`, which
  reads its expectation off the system under test; `test-subscribe-wallet.js`
  asserted only status 400 for an unknown wallet, the same status the
  missing-name branch returns.

Clean on both rounds: nothing logs, mails or posts a key, token, card datum,
buyer email or buyer-facing message; `buildPurchase()` keeps `billing_info`
to the single `token_id` (B2 intact); `clean(body.wallet, 20)` plus the
`WALLET_METHODS` allow-list rejects anything else with a named 400; nothing
is reachable by a buyer with all three switches `false`; `.assetsignore`
needs no new line (`scripts/` is covered wholesale, `assets/*` is meant to
serve); the live card path is unchanged but for the two additions above.

Accepted as-is, not worth a third round: in `wallet-paypal.js`'s new
`catch`, `if (button.parentNode) button.parentNode.removeChild(button)` can
never fire, because the button is appended only after the `try` succeeds. It
is harmless and defensive; a later reader should not take it as evidence the
button was ever mounted.

### Fixed in

- BLOCKER — `f95c69d`, three ways over: `markReady()` now runs last in
  `setupCard()`, after `card.attach()`; each callback runs in its own
  `try`/`catch` (`checkout.html:353-357`); and `wallet-paypal.js` catches a
  throwing `recurly.PayPal()` itself and mounts no button, the
  silent-unavailable shape G4/A4 already specify. **Red-proved by the
  overseer, not only by the worker:** the new check in
  `scripts/test-wallet-paypal.mjs` was run against a `git archive` of the
  pre-fix commit `4640f23` and failed there —
  `FAIL - a throwing recurly.PayPal() still lets the card field attach
  (blocker fix) (got "[]")` — and passes 13/13 on this tree.
- C4 — `59f1805`: `payment_type: 'Credit Card'` added to the card path's
  `add_payment_info`, the untrue comment corrected, and
  `test-ga4-events.mjs` now checks the card event carries it (27 checks, up
  from 26). The overseer amended spec C4 on `main` the same day to say the
  card path must name itself, rather than weaken the spec to match the code.
- Globals and the self-contradicting comment — `f95c69d` (IIFE wrap).
- 3-D Secure retry — `85d6611`: a comment at the seam saying it is card-only
  and why, no behaviour change, plus the Spec proposals entry. The overseer
  recorded the spec side on `main` as wallets.md **K3c** and tied it to
  worker.md's 2026-10-09 hand-back defect: whoever fixes the hand-back must
  fix the retry in the same worktree, or a branch that can never fire
  becomes one that fires and fails for every wallet buyer.
- Spec proposals — `85d6611`: all three entries (the C4 deviation, the
  card-only retry, and `assets/flow.css` having no `.wallets` rule, which is
  harmless while the row is empty but a prerequisite for whoever flips a
  switch; `flow.css` correctly untouched).
- Nits — `f2e6500`, all three.
- Brief's own State — `9494fdf`, `b365296`.

Not this branch's, carried as open work elsewhere: the 3-D Secure hand-back
defect (worker.md, 2026-10-09); `sendDeclineAlertEmail` carrying no `wallet=`
field where `logDecline` now does; `scripts/test-subscribe-rate-limit.sh`
being both port-bound to 8799 (its `cleanup()` kills another session's
`wrangler dev`) and, since `f34be49` added the `SEND_EMAIL` binding,
answering six 501s instead of five 503s and a 429 — suspected `send_email`
being unimplemented in local `wrangler dev`, i.e. a local-testability
regression on `main`, unverified. All three are recorded on the specs on
`main`.

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

This round, all now committed (`f95c69d`, `59f1805`, `85d6611`, `f2e6500`):
- [BLOCKER] `f95c69d`: checkout.html moved `markReady();` from before
  `recurly.Elements()`/`card.attach()` to the very end of setupCard(),
  wrapped each `cb()` inside markReady()'s forEach in try/catch;
  assets/wallet-paypal.js rewritten — whole file wrapped in an IIFE (also
  fixes the SHOULD-FIX global-leak item), `window.recurly.PayPal(...)`
  now in try/catch, removes the button and shows nothing on throw (G4/A4
  silent-unavailable shape), self-contradicting comment fixed. New
  scripts/test-wallet-paypal.mjs check proved red against a scratch copy
  of pre-fix HEAD (`.../scratchpad/pre-blocker-fix`: 1 FAIL, card.attach
  never reached) before green against the working tree (13/13).
- SHOULD-FIX C4, `59f1805`: checkout.html's card add_payment_info event
  now sends `payment_type: 'Credit Card'`; wallet-common.js's untrue
  "GA4 reads as its default" comment fixed; new test-ga4-events.mjs
  check that the card event carries it.
- SHOULD-FIX 3DS-retry + Spec proposals, `85d6611`: comment at
  checkout.html's subscribe(tokenId, threeDSResultId) saying the 3-D
  Secure retry is card-only and why (no behaviour change); Spec
  proposals section filled in with all three items (C4 deviation,
  card-only 3DS retry, flow.css `.wallets` gap — flow.css itself
  untouched).
- NITS, `f2e6500`: wallet-common.js trims each source before choosing
  between wallet/field; test-wallet-common.js's self-checking
  `isOn('paypal') === WALLETS.paypal` line dropped; test-subscribe-wallet.js's
  `wallet:'bitcoin'` case now also asserts the "Unknown payment method."
  message.

Every suite re-run clean against the final committed tree, zero FAIL
lines anywhere: test-wallet-seam.sh, test-wallet-common.js,
test-wallet-paypal.sh (both the red run against the pre-fix scratch copy
and the green run against this tree), test-subscribe-wallet.js,
test-ga4-events.sh, test-checkout-address.sh, test-decline-reasons.js,
test-raillog-alert.js, test-subscribe-build-purchase.js,
test-subscribe-decline-alert.js, test-subscribe-decline-email.js.
test-subscribe-rate-limit.sh deliberately NOT run (port 8799 collision/
collateral-kill risk, per overseer's explicit instruction and the Trap
below). Reported to landing-opzichter; overseer fills the Verdict and
lands — nothing further to do here unless it comes back with more
feedback.

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
