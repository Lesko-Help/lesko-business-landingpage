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

Saved 2026-10-23. DONE — green, committed, NOT landed.

Done:
- `84284ec` — `assets/wallet-paypal.js` + both suites. Removed `MISSING_EMAIL`
  and `requireEmail()`. Added `EMAIL_LOOKUP_MS = 4000` and
  `paypalEmail(actions)`: resolves PayPal's `subscriber.email_address`, never
  rejects, never throws, gives up after 4 s. `onClick` only counts the click.
  `createSubscription` no longer throws. `onApprove(data, actions)` resolves
  the address, then finishes with PayPal's > typed > ''. A failing analytics
  `track()` no longer shows the buyer a payment error.
- `d2b30e2` — this brief.
- Suites all green: wallet-paypal 67, ga4-events 34, wallet-seam 30,
  wallet-common 28. `assets/wallet-common.js` and `checkout.html` untouched.
- RED PROVED TWICE OVER. First, before any test was edited, the untouched
  suite failed exactly the 8 refusal checks (49 passed) — so the old guard was
  genuinely covered. Then each new belt was broken in a scratch copy and
  judged by EXIT CODE: delete the give-up timeout -> red; never ask PayPal ->
  red (3 checks); let a thrown `get()` escape -> red; prefer the typed address
  -> red. Baseline green before and after each.

Next (for the overseer / Martin, not for this worktree):
1. Review `git diff origin/main...HEAD` and land with `wt-done.sh
   paypal-email-guard` — landing IS the deploy here.
2. Apply the two spec edits under "Spec proposals" on main (P6 rewrite, C7
   line). The code and the spec disagree until that is done.
3. After landing, click the PayPal button on all three plans with the email
   box EMPTY and confirm PayPal's window opens. Needs real Chrome; headless
   gets a Cloudflare 403 on leskohelp.com (leskobusiness.com itself is fine).
4. Still open, untouched here: `checkout.html` tells the buyer the typed
   address creates their community account. For a PayPal buyer that is still
   the PayPal address. Copy fix, its own task.

Traps (with dates):
- 2026-10-23: `main` is production here; a push to main deploys in a minute.
  This worktree never pushes to main.
- 2026-10-23: **a test suite can pass by not finishing.** `await`ing a promise
  that never settles let node exit 0 partway through this file, and a
  rejection aborted a block mid-way; both printed no FAIL and read as green to
  a grep. Judge a red-proof by EXIT CODE. Fixed here with `outcomeWithin()`
  (names ok/rejected/timeout, never throws) and the `EXPECTED_CHECKS` tail
  guard. Raise `EXPECTED_CHECKS` (now 66, counting everything but itself) in
  the same commit that adds a check.
- 2026-10-23: `timeout` does not exist on macOS — a red-proof wrapped in it
  silently never ran and looked green. Use exit codes, not `timeout`.
- 2026-10-23: do not split shell strings on `|` when the pattern contains
  `||`; one red-proof garbled its own break that way and still went red, for
  the wrong reason. Redone with python.
- 2026-10-23: the headless claude-browser gets a Cloudflare 403 on
  leskohelp.com and on the CF order pages; use real Chrome for a live look.
- 2026-10-23: GA4's BigQuery export starts 2026-10-15. No click figure exists
  before that date.
- 2026-10-17 (carried): never wire ClickFunnels' PayPal plan ids
  (`P-53254044JY930561J7DITTBA`, `P-79D02773R0628232US3LCZRY`,
  `P-7TV41146KY851263NROQAXEQ`, `P-80J45642K6983362LS2OVYFQ`). Our PayPal
  account holds exactly 3 plans; none of those is among them.
- 2026-10-23: jsdom does not navigate; this suite patches jsdom's own
  `navigate()` and reads `lastNavigatedTo`. A new test that forgets
  `await flushMicrotasks()` after the now-async `onApprove` reads a stale value.
