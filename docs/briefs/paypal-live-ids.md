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

# Brief: paypal-live-ids

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Wire leskobusiness.com's PayPal button to the three plans that now exist in Lesko's OWN PayPal merchant account, and switch PayPal on.

Two commits, in this order.

Commit 1 — correct the plan ids and fill in the client id.
The ids currently in assets/wallet-paypal.js are DEAD and belong to a DIFFERENT merchant account (both return HTTP 404 against our credentials): P-7TV41146KY851263NROQAXEQ and P-80J45642K6983362LS2OVYFQ. Replace PAYPAL_PLAN_IDS with all three live plans, verified ACTIVE in our account on 2026-10-17:
  monthly   P-7R176589BE0160805NLJVCFI   $29.95 every 1 MONTH
  half-year P-2GV64945HR320740CNLIP2HY   $89.95 every 6 MONTH
  yearly    P-8M862053KT491162FNLJVCFI   $149.95 every 1 YEAR
All three sit on product PROD-25B93089XF9559540. half-year is NEW to the table — the module had no entry for it, so update the test that pins 'half-year has no PayPal plan -> no SDK tag, no button' (scripts/test-wallet-paypal.mjs around line 189) to the opposite: half-year now renders a button on its own plan id. Keep a check that an unknown plan still renders nothing, so line 108's guard stays proven.
Set PAYPAL_CLIENT_ID to the real value. Read it yourself, do not ask for it:
  gcloud secrets versions access latest --secret=paypal-client-id --project=lesko-486515
It is 80 characters, it is PayPal's PUBLIC browser id, and it is meant to be visible in the page — hard-code it in assets/wallet-paypal.js as the module and its test are already built to expect. The matching paypal-secret must NEVER appear in this repo or in any output.
The test harness substitutes into the literal PAYPAL_CLIENT_ID = '' and throws when it cannot find it — keep the line shape it can still patch, or update the harness deliberately and say so in the brief.
Update docs/specs/modules/wallets.md P2: the ids, where they come from (our own account, not ClickFunnels), and that half-year now has one.

Commit 2 — switch PayPal on.
assets/wallet-common.js line 12, WALLETS.paypal: false -> true. Nothing else.

Proof required before you report back: scripts/test-wallet-paypal.sh . green, and each of the three plan ids proven red — change one id to a wrong value and show a check fails. Also run the three neighbour suites (checkout, worker, ga4) and report their counts. Do NOT push to main; the overseer lands it on Martin's word.

Context you need: provisioning already handles this rail — lesko-provisioning's webhooks/publish.py has SIGNUP_EVENTS['paypal'] = {'BILLING.SUBSCRIPTION.ACTIVATED'}, it takes the buyer email from subscriber.email_address (webhooks/rails.py:492), and the MN plan comes from rail -> plan id in ref_rail_plans, so a new P-... id needs nothing added there. Our account's webhook is registered at the lesko-provisioning Cloud Run URL for ALL events. The three PayPal prices now match the page's prices exactly, so assets/site-events.js PLAN_PRICES_USD needs no change.

## Done when

`scripts/test-wallet-paypal.sh .` green: each of monthly, half-year and yearly renders a button on its own live plan id, an unknown plan still renders nothing, the shipped client id is a real 80-character id. Red first: with one plan id changed to a wrong value, a check fails (shown for each of the three). The three neighbour suites (checkout, worker, ga4) stay green.

Spec: unchanged by this worktree — specs are the overseer's; the P2 rewrite is proposed under Spec proposals below.


## May touch

Module `wallets`. Files: `assets/wallet-paypal.js`, `assets/wallet-common.js` (line 12 only, commit 2), `scripts/test-wallet-paypal.mjs`, this brief.

## Deploy implied

No script: a push to `main` is the deploy (Workers Builds). Commit 2 makes the PayPal button visible to buyers, so it goes live with the landing. The overseer lands it on Martin's word.

## Context

2026-10-17: the old ids (P-7TV41146KY851263NROQAXEQ, P-80J45642K6983362LS2OVYFQ) belong to another merchant and return 404 on our credentials. Live plans in our own account on product PROD-25B93089XF9559540: monthly P-7R176589BE0160805NLJVCFI $29.95, half-year P-2GV64945HR320740CNLIP2HY $89.95, yearly P-8M862053KT491162FNLJVCFI $149.95. Client id comes from `gcloud secrets versions access latest --secret=paypal-client-id --project=lesko-486515` (public, hard-coded); the matching paypal-secret never enters the repo. Provisioning needs nothing new (SIGNUP_EVENTS['paypal'], ref_rail_plans). The overseer's memory message had not arrived when this brief was committed.

Harness change, deliberate: `test-wallet-paypal.mjs` patched the literal `PAYPAL_CLIENT_ID = ''`. With a real id in the file it now patches whatever value sits between the quotes (`clientId: ''` gives the empty-id case), and the 'ships empty' check became 'ships an 80-character id'.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

The brief's Goal asked this worktree to edit `docs/specs/modules/wallets.md` P2; specs are the overseer's and `wt-done.sh` refuses a branch that touches them, so the text is proposed here instead (filled in at the end).

File `docs/specs/modules/wallets.md`, function P2. Now says: plan map copied from ClickFunnels, monthly P-7TV41146KY851263NROQAXEQ ($19.95), yearly P-80J45642K6983362LS2OVYFQ, half-year has no plan, monthly gap accepted. Should say: the plan map is a constant at the top of `wallet-paypal.js`, ids from Lesko's OWN PayPal merchant account (product PROD-25B93089XF9559540, ACTIVE, checked 2026-10-17), not ClickFunnels: `monthly` P-7R176589BE0160805NLJVCFI ($29.95/month), `half-year` P-2GV64945HR320740CNLIP2HY ($89.95/6 months), `yearly` P-8M862053KT491162FNLJVCFI ($149.95/year). All three match the page and card prices, so the 2026-10-17 monthly-gap decision is closed. A plan the page offers but the map lacks still shows no button (the `!planId` guard). Why: the old ids were another merchant's and returned 404.

Same file, C1 and the DECISION of 2026-10-09 (all switches ship false): `paypal` ships `true` since 2026-10-17 (commit `Switch PayPal on`); `apple_pay` and `google_pay` stay `false`. P3 now ships a real 80-character client id instead of an empty one. Test line: P2 now covers three plans plus an unlisted plan (checkout.html maps an unknown `?plan=` to monthly, so the test makes the page report an unlisted name).

Left alone because out of scope: `checkout.html` line 23 comment still says all three switches ship false.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done:
In flight (file:line):
Next:
Traps (with dates):
