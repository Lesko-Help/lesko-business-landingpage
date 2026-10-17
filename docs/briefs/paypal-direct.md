---
# Pairing block: what this worktree is paired to. Read by control-window.sh
# (cw_pairing) for the overview. wt-new.sh fills repo, and module and spec
# when WT_MODULE was given; everything else is yours or the interview's.
# Never guess a value from a branch, folder or repo name: leave `<fill in`.
client: n/a (Lesko's own site)
repo: landing
rails: PayPal (straight into PayPal, not Recurly)
module: wallets
spec: docs/specs/modules/wallets.md
folder: n/a (no client folder)
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

`scripts/test-wallet-paypal.sh .` (P1-P8, K7): red against `origin/main` (the old Recurly-route file ships no `PAYPAL_CLIENT_ID`), green on this branch. Guards proven able to go red: an `alert()` call and a wrong plan id each fail it. P6 is pinned per belt (overseer review, 2026-10-17): deleting the whole `onClick` handler fails 2 checks (`onClick exists`, `actions.reject()` count); deleting the `requireEmail()` line in `createSubscription` fails 2 (`no subscription is created`, `createSubscription throws`). `test-wallet-seam.sh` and `test-wallet-google-pay.sh` stay green.

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

Done: new `scripts/test-wallet-paypal.mjs`, rewritten `assets/wallet-paypal.js`, review fix (P6 split into onClick and createSubscription checks, both red-proven), origin/main merged (spec amended on main 03d9503), front matter filled.
In flight: nothing.
Next: report to landing-opzichter [8241aa]; landing waits on Martin.
Traps (with dates): 2026-10-17 a check written as `a || b` hides one belt, pin each alone. 2026-10-17 `ListAgents` shows two `landing-opzichter`; the one on this machine is [8241aa]. 2026-10-17 GA4 value for PayPal is wrong ($29.95 vs $19.95 billed), left open for an analytics worktree.
