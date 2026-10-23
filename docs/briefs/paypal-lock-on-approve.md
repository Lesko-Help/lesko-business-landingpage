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

# Brief: paypal-lock-on-approve

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Expose busy() on the LeskoCheckout seam and have the PayPal path lock the card form the moment PayPal approves, closing the double-charge window instead of shortening it; then restore EMAIL_LOOKUP_MS and relax the <=1500 pin

## Done when

`scripts/test-wallet-paypal.sh .` green, including the new P10 checks. Proved
red by exit code against the original bug shape — moving `lockForm()` to after
the lookup, not merely deleting it.

Spec: docs/specs/modules/wallets.md needs a new **P10** and one line on K1 —
see Spec proposals. The seam grew a seventh function.

## May touch

Module `wallets`: `checkout.html` (the seam only — one key plus its comment),
`assets/wallet-paypal.js`, `scripts/test-wallet-paypal.mjs`.
Not touched: `worker.js`, the card submit path, the other wallet files.

## Deploy implied

None of its own: a push to `main` IS the deploy.

## Context

`83cc0a7` made the PayPal success path await an address lookup before
`finish()`. `finish()` was the thing that called `busy(true, 'Payment
received…')` and disabled the card button, so between PayPal handing control
back and `finish()` the buyer saw a live "Pay $29.95 now" while a PayPal
subscription already existed — a second charge, on the Recurly rail. Confirmed
enabled on the live page 2026-10-23. `ec08971` cut the window 4 s -> 1 s as an
interim. This closes it instead.

Found by an independent review of `83cc0a7`, not by its author.

## Spec proposals

1. **New P10**: `onApprove` calls `lockForm()` as its first statement, on every
   branch, and never undoes it. Once PayPal has approved, paying by card is
   never the right next step. The label is deliberately not "Payment received"
   — on the no-subscription-id branch we do not know that it was; `finish()`
   sets that wording itself on the success path. A seam without `busy` (an
   older or cached checkout.html) still completes the order.
2. **K1 gains `busy(on, label)`** — the seam is seven functions, not six. Its
   reason belongs in the spec: only the page can disable its own button, and a
   wallet that has already taken the money needs that lock.
3. **P6's bound changed**: `EMAIL_LOOKUP_MS` is back to 4000 and its test bound
   relaxed from <= 1500 to <= 5000 ms, because the number is no longer a
   double-charge window — only how long a buyer waits at a disabled button.
4. Still outstanding from `paypal-email-guard`: P5, P9, the wallets.md Test
   paragraph (it says 57 checks; it is 77), page.md:142, welcome.html copy.

## State

Saved 2026-10-23. DONE — green, landed.

Done:
- `checkout.html`: `busy` added to the `window.LeskoCheckout` seam, with the
  reason in the comment. Nothing else on that page touched.
- `assets/wallet-paypal.js`: new `lockForm()`, called as the FIRST statement in
  `onApprove`, before any branch, never undone. Guarded with a `typeof` check so
  a seam without `busy` degrades instead of throwing after the money is taken.
  `EMAIL_LOOKUP_MS` 1000 -> 4000, because its length no longer costs a charge.
- `scripts/test-wallet-paypal.mjs`: 8 new checks. The important one asserts the
  button is disabled DURING the lookup, before it answers — after `finish()`
  the page is locked anyway, so a check placed later would pass without the
  lock existing. Also: the no-subscription-id branch locks too, the relabel, a
  seam without `busy` still completes, a not-vacuous "live before approval"
  check, and a source check that `lockForm()` is the first statement.
  The <= 1500 bound relaxed to <= 5000. EXPECTED_CHECKS 68 -> 76 (suite is 77).
- RED PROVED by exit code, in a scratch copy, four ways: delete the
  `lockForm()` call -> red (4 checks); **move it to after the lookup, i.e. the
  original bug shape -> red (4 checks)**; drop `busy` from the seam -> red on
  behaviour while the degradation check correctly stays green; push
  EMAIL_LOOKUP_MS to 9000 -> red on the bound. Baseline green before and after.
- Suites: wallet-paypal 77/0, ga4-events 34/0, wallet-seam 30/0,
  wallet-common 28/0.

Still open after this:
- The spec edits above, plus the four carried from `paypal-email-guard`.
- The live click-through on all three plans with the email box empty, which
  needs real Chrome (headless gets a Cloudflare 403 on leskohelp.com;
  leskobusiness.com itself renders fine).

Traps (with dates):
- 2026-10-23: `main` is production; the push IS the deploy.
- 2026-10-23: **check a lock while the thing it guards is still in flight.** A
  check after the async work passes even with no lock at all, because
  `finish()` locks the page on its way out. The red-proof that matters is
  moving the lock later, not deleting it.
- 2026-10-23: a test that reads a constant from source follows the constant, so
  it proves behaviour but not the value. Pin a value that is itself the point
  of a change with its own check.
- 2026-10-23: judge every red-proof by EXIT CODE, never by grepping FAIL — a
  crashed or early-exiting suite prints no FAIL line.
- 2026-10-23: `timeout` does not exist on this macOS box.
