---
# Pairing block: what this worktree is paired to. Read by control-window.sh
# (cw_pairing) for the overview. wt-new.sh fills repo, and module and spec
# when WT_MODULE was given; everything else is yours or the interview's.
# Never guess a value from a branch, folder or repo name: leave `<fill in`.
client: <fill in>
repo: landing
rails: <fill in>
module: wallets
spec: docs/specs/modules/wallets.md
folder: <fill in>
---

# Brief: paypal-direct

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Rewrite assets/wallet-paypal.js to create the subscription inside PayPal with PayPal's own JS SDK against the two plan ids the ClickFunnels order pages use, per docs/specs/modules/wallets.md P1-P8 and K7; PAYPAL_CLIENT_ID ships empty and the paypal switch stays false, with scripts/test-wallet-paypal.sh red first against origin/main

## Done when

The test or assertion that must go from red to green. Name it. If it does not
exist yet, writing it is the first task — and prove it goes red before trusting
it green.

`scripts/test-wallet-paypal.sh .` (P1-P8, K7): red against `origin/main` (the old Recurly-route file ships no `PAYPAL_CLIENT_ID`), green on this branch. Guards proven able to go red: an `alert()` call and a wrong plan id each fail it. `test-wallet-seam.sh` and `test-wallet-google-pay.sh` stay green.

Spec: unchanged because the overseer already wrote P1-P8 and K7 (commit dab0cb9); see Spec proposals for two small notes.


## May touch

Module `wallets`. Files: `assets/wallet-paypal.js`, `scripts/test-wallet-paypal.mjs`, `scripts/test-wallet-paypal.sh`. Nothing else; `checkout.html` and `wallet-common.js` stay as they are.

## Deploy implied

None beyond the usual push to `main`. `PAYPAL_CLIENT_ID` ships empty and `WALLETS.paypal` stays false, so nothing changes for a buyer. Going live later = Martin's client id plus flipping the switch.

## Context

2026-10-17: the overseer's memory message had not arrived when this was committed. Source of truth is `docs/specs/modules/wallets.md` (P1-P8, K7, Decisions 2026-10-17). Plan ids: monthly `P-7TV41146KY851263NROQAXEQ`, yearly `P-80J45642K6983362LS2OVYFQ`; no half-year plan. Test fakes PayPal's SDK: the code adds a script tag, the test puts a stub `paypal` global on the window and calls the tag's `onload`.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

1. P3 lists the SDK URL without `disable-funding=card`, but P8 needs it and PayPal takes it only as a URL parameter. The code appends `&disable-funding=card`. Spec should list it in P3.
2. P6 does not say how the missing email is refused. The code does it twice: `onClick` returns `actions.reject()` so PayPal's window never opens, and `createSubscription` re-checks and throws. Spec should name `onClick`.
3. P5's GA4 `value` is the page's displayed total (`LeskoCheckout.total()`), so PayPal monthly reports $29.95 although PayPal bills $19.95. Spec is silent.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done:
In flight (file:line):
Next:
Traps (with dates):
