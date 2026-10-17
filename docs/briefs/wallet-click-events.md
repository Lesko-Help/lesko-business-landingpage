---
# Pairing block: what this worktree is paired to. Read by control-window.sh
# (cw_pairing) for the overview. wt-new.sh fills repo, and module and spec
# when WT_MODULE was given; everything else is yours or the interview's.
# Never guess a value from a branch, folder or repo name: leave `<fill in`.
client: <fill in>
repo: landing
rails: PayPal JS SDK buttons; GA4
module: wallets
spec: docs/specs/modules/wallets.md
folder: assets/ and scripts/
---

# Brief: wallet-click-events

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Measure the PayPal button on /checkout, not only the payments that complete. Today the only PayPal event is the add_payment_info inside onApprove (spec P5, assets/wallet-paypal.js:70) — it fires AFTER PayPal has already created the subscription, so GA4 shows reached-checkout and paid-with-PayPal but nothing in between: a click, a click refused for a missing email (P6), a buyer who opened PayPal's window and closed it, and a PayPal error all leave no trace at all. Add four GA4 events in the handlers that already exist in assets/wallet-paypal.js, through window.LeskoAnalytics.track and the no-op stand-in already on the page: (1) the click on the button, with plan, USD price and payment_type PayPal — the denominator the funnel is missing; (2) the same click when requireEmail() refuses it (P6), marked so the missing-email leak can be counted on its own, which is the one most likely to be losing buyers; (3) the buyer closing PayPal's window (onCancel); (4) onError. Keep the existing add_payment_info exactly as it is, and keep P7: a cancel still shows the buyer nothing. Decide the event names and parameter shape ONCE and write them into docs/specs/modules/wallets.md as new numbered items (P9 for the PayPal handlers, and a C-series item for the shape), because apple_pay and google_pay must send the same shape when they are switched on — a per-wallet naming invention is the thing to avoid. Do not touch the card path in checkout.html, do not touch GA4_MEASUREMENT_ID, do not add a file to any page, and do not change a word of visible copy (the page is Giulia's). Extend scripts/test-wallet-paypal.mjs and scripts/test-ga4-events.sh to cover every new event, and prove each new check can go red by breaking it on purpose on a scratch copy (git archive, as the paypal-live-ids branch did) — report which mutant reddened which check. Report back to the overseer when done; never push to main.

## Done when

`scripts/test-wallet-paypal.sh .` and `scripts/test-ga4-events.sh .` gain checks for the four new events (click, click refused for missing email, cancel, error). They go red on origin/main (no such events) and green on this branch; each new check is also shown red against a deliberate mutant on a `git archive` scratch copy. The existing `add_payment_info` and P7 (a cancel shows nothing) checks stay green.

Spec: docs/specs/modules/wallets.md updated — by the overseer, from the proposals below (workers never edit docs/specs/).


## May touch

Module: wallets. Files: `assets/wallet-paypal.js`, `scripts/test-wallet-paypal.mjs`, `scripts/test-ga4-events.mjs`, this brief. Not: the card path in `checkout.html`, `GA4_MEASUREMENT_ID`, any page's script tags, any visible copy, `docs/specs/`.

## Deploy implied

None beyond the normal push to `main` (Workers Builds). Static JS file only; no new file, so `.assetsignore` is unaffected.

## Context

2026-10-17: the overseer's memory message had not arrived when this brief was committed; add it here if it comes. Design decision (mine, proposed to the spec below): event names `wallet_click`, `wallet_click_refused`, `wallet_cancel`, `wallet_error`, all with the same params as `add_payment_info` (`currency`, `value`, `payment_type`, `items`); `wallet_click_refused` adds `reason: 'missing_email'`. A refused click sends both `wallet_click` and `wallet_click_refused`, so `wallet_click` stays the full denominator. A missing-email throw in createSubscription/onError is not a `wallet_error` (already counted as refused). No PayPal error text is sent to Google.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done:
In flight (file:line):
Next:
Traps (with dates):
