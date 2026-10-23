---
# Pairing block: what this worktree is paired to. Read by control-window.sh
# (cw_pairing) for the overview. wt-new.sh fills repo, and module and spec
# when WT_MODULE was given; everything else is yours or the interview's.
# Never guess a value from a branch, folder or repo name: leave `<fill in`.
client: lesko
repo: landing
rails: paypal
module: wallets
spec: docs/specs/modules/wallets.md
folder: /Users/admin/Lesko/lesko-business-landingpage
---

# Brief: paypal-email-guard

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Stop the PayPal button refusing a click when the email box is empty (spec P6); take the buyer's email from PayPal's own subscription in onApprove instead, so /welcome shows the address that actually gets access

## Done when

`scripts/test-wallet-paypal.sh .` is green, including the new P6 block ("no
email: the click is NOT rejected", "the subscription IS created on the right
plan"), the new priority-order block ("PayPal's address beats the typed one")
and the new P7 belts ("a subscription.get() that never answers is given up on").
Red first proved against this branch's own starting point: the old suite failed
8 checks the moment the refusal came out (recorded below).

`scripts/test-ga4-events.sh .` green too — it drives a refused PayPal click and
has to stop expecting one.

Spec: docs/specs/modules/wallets.md needs the overseer's edit — see Spec
proposals. P6 as written mandates the refusal this task removes.


## May touch

Module: `wallets`.
- `assets/wallet-paypal.js` — the guard, and the new email lookup.
- `scripts/test-wallet-paypal.mjs` — its suite.
- `scripts/test-ga4-events.mjs` — the two refusal checks only.

NOT touched, on purpose: `assets/wallet-common.js` (its C3 empty-email refusal
belongs to Apple Pay and Google Pay, which post to our Worker and really do
need the address); `checkout.html`; `worker.js`; the card path.

## Deploy implied

None of its own: a push to `main` IS the deploy here (Cloudflare Workers
Builds). So landing this branch puts it on leskobusiness.com within a minute.
Martin lands it; this worktree does not push to main.

## Context

Measured 2026-10-23 from GA4's BigQuery export (`lesko-486515.analytics_556794866`,
history begins 2026-10-15 only) and the provisioning warehouse:

- 5 `wallet_click` on /checkout since PayPal went live 2026-10-17: monthly 3,
  half-year 1, yearly 1. **2 of the 5 were `wallet_click_refused` with
  reason `missing_email`** — this guard. 1 `wallet_cancel`. 1 sale.
- The sale: half-year $89.95, 2026-10-18, sub `I-E4JKRWJ2Y31L` on plan
  `P-2GV64945HR320740CNLIP2HY`, ACTIVE, nothing owed. MN user 34081074 created,
  plan 124955 granted (`provisioning_log`, rails `paypal` and `paypal_ipn`).
- Why the guard bought nothing: lesko-provisioning reads
  `subscriber.email_address` off PayPal's webhook and never sees the typed box.
  So the typed address was being demanded for /welcome display only — and when
  it differs from the PayPal one it prints a login that does not work.
- `/welcome` already handles a missing email: it prints the placeholder "the
  email you entered on the payment page" (welcome.html:53, guarded by the
  regex test at welcome.html:137).

## Spec proposals

For the overseer to apply on `main` (this worktree never edits docs/specs/).

1. **P6 must be rewritten.** It now says the click is refused when no email is
   typed, with `wallet_click_refused` / reason `missing_email`. It should say:
   the click is never refused; after approval the buyer's address is resolved
   from PayPal's own subscription (`actions.subscription.get()` →
   `subscriber.email_address`), falling back to the typed box, then to ''; and
   that resolution may never lose a paid order, so every failure of that call —
   absent, rejected, thrown or hanging past 4 s — completes the order anyway.
   Reason: the refusal killed 2 clicks in 5 and protected a value provisioning
   never uses.
2. **C7 needs one line.** `wallet_click_refused` stays a C7 name, but PayPal no
   longer sends it; Apple Pay and Google Pay still do, through
   wallet-common.js's C3. So "every wallet reports the same four" is no longer
   true of PayPal, and a test that demands all four from one wallet is wrong.
3. **The open 2026-10-17 gap "a PayPal buyer's MN access goes to their PayPal
   email" is now half closed.** Access still goes there — unchanged — but
   /welcome finally prints that same address instead of a different one. The
   remaining half is copy on checkout.html, which this task did not touch.

## State

Saved 2026-10-23, context guard.

Done:
- `assets/wallet-paypal.js` rewritten. Removed `MISSING_EMAIL` and
  `requireEmail()`. Added `EMAIL_LOOKUP_MS = 4000` and
  `paypalEmail(actions)` — resolves PayPal's `subscriber.email_address`,
  never rejects, never throws, gives up after 4 s. `onClick` now only counts
  the click. `createSubscription` no longer throws. `onApprove` is now
  `(data, actions)`, resolves the address, then finishes; analytics failure is
  swallowed rather than reaching the catch (it used to show "could not
  confirm" if `track()` threw). `onError` lost its MISSING_EMAIL special case.
- RED PROVED, before any test was touched: the untouched suite failed exactly
  8 checks, all of them the refusal ones (no subscription created / error box
  asks for email / onClick rejects / createSubscription throws /
  wallet_click_refused shape / click still rejected / throwing-track rejected
  count / four-C7-names). 49 passed. So the old guard was genuinely covered.
- `scripts/test-wallet-paypal.mjs`: `loadSdk` takes an optional third argument
  `subscriptionGet` that becomes `actions.subscription.get` (absent by default,
  which is why every pre-existing check still reads the typed address). P6
  block replaced with the refusal-is-gone invariant. New block for the address
  priority order (PayPal > typed > ''). New P7 block for rejected / throwing /
  subscriber-less / hanging `get()`, plus a non-vacuous check that the hang
  really was pending before the timeout, plus a throwing `finish()`. P9 block
  no longer expects a refusal; the C7 source check now pins the three names
  PayPal sends and that `wallet_click_refused` is gone from the source.

In flight (file:line):
- Nothing half-written. Next action is simply to run the two suites.

Next:
1. `scripts/test-wallet-paypal.sh .` — expect green; fix what is not.
2. `scripts/test-ga4-events.mjs` lines ~180-187 still drive a refused click and
   assert `wallet_click_refused` with reason `missing_email`. Rewrite those two
   checks to assert one `wallet_click` and NO refusal. Then
   `scripts/test-ga4-events.sh .`.
3. `git add -N .` then `git diff origin/main...HEAD` and read it whole.
4. Commit (one idea), report to the overseer, STOP. Do not push to `main` —
   that is the deploy, and it is Martin's call.

Traps (with dates):
- 2026-10-23: `main` is production here; a push to main deploys in a minute.
  This branch must not be pushed to main by this worktree.
- 2026-10-23: the headless claude-browser gets a Cloudflare 403 on
  leskohelp.com AND on the CF order pages; use real Chrome
  (claude-in-chrome) to look at a live page. leskobusiness.com itself
  renders fine headless.
- 2026-10-23: GA4's BigQuery export starts 2026-10-15. Any click figure older
  than that does not exist — do not present one.
- 2026-10-17 (carried): never wire ClickFunnels' PayPal plan ids
  (`P-53254044JY930561J7DITTBA`, `P-79D02773R0628232US3LCZRY`,
  `P-7TV41146KY851263NROQAXEQ`, `P-80J45642K6983362LS2OVYFQ`). Our PayPal
  account holds exactly 3 plans and none of those is among them.
- 2026-10-23: `jsdom` does not navigate; this suite patches jsdom's own
  `navigate()` and reads `lastNavigatedTo`. A new test that forgets
  `await flushMicrotasks()` after an async `onApprove` reads a stale value.
