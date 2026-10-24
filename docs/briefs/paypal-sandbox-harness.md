---
# Pairing block: what this worktree is paired to.
client: lesko
repo: lesko-business-landingpage
rails: paypal
module: wallets
spec: docs/specs/modules/wallets.md
folder: /Users/admin/Lesko/lesko-business-landingpage
---

# Brief: paypal-sandbox-harness

Stages: oneshot + review (klein).

## Goal

The PayPal sandbox proof that was run by hand on 2026-10-23 becomes one
re-runnable command in the repo, so the next change to `wallet-paypal.js` can
be proved against PayPal's real SDK before it ships instead of after.

## Done when

`scripts/manual-paypal-sandbox.sh all` buys one sandbox subscription per plan
with the email box left empty and prints PASS for every claim, exit 0 — and
exit non-zero when a claim fails. Proven red by pointing the harness at a
page whose `lockForm()` call is deleted: check B must fail.

Spec: docs/specs/modules/wallets.md updated (by the overseer on main — a
branch that edits docs/specs/ is refused by wt-done.sh guard 3).

## May touch

Module `wallets`. Only new files under `scripts/`, plus this brief. No page,
no asset, no worker — the harness reads the pages and never writes to them.

## Deploy implied

None. `scripts/` is listed in `.assetsignore`, so nothing here reaches
leskobusiness.com. Confirm that with a 404 after landing.

## Context

Why this exists, in one line: the four things jsdom cannot answer are whether
PayPal's real SDK has `actions.subscription.get()`, whether it returns the
buyer's address, whether `lockForm()` really kills the card button mid-flow,
and whether the subscription reaches ACTIVE on the plan the button named.

What the hand run proved on 2026-10-23, with the email box empty every time:

| plan      | subscription     | status | charged |
|-----------|------------------|--------|---------|
| monthly   | `I-RN5ST43YJCW1` | ACTIVE | $29.95  |
| half-year | `I-NCTJAN86NMRR` | ACTIVE | $89.95  |
| yearly    | `I-SR7PD2EXGVL3` | ACTIVE | $149.95 |

That mattered because **yearly had never completed a purchase on any version
of the code**, and half-year's only prior sale (2026-10-18, `I-E4JKRWJ2Y31L`)
was on the old code with the refusal still in place.

Three bugs in the hand version, fixed here rather than carried over:

1. `make_sandbox_plans.py`'s docstring said it read GCP Secret Manager; the
   code read the macOS Keychain. The docstring was wrong, not the code.
2. The port was hard-coded to 8788. `docs/specs/modules/worker.md:42` records
   what a hard-coded port plus a `pkill` cleanup did to another worktree's
   server — this picks a free port and kills only the pid it started.
3. The fourth claim (the subscription is ACTIVE in PayPal, on the right plan,
   for the right amount) was checked by hand and not by the script, so a
   re-run would not have re-proved it. It is `paypal-sandbox-verify.py` now.

Credentials: Keychain service `leskobusiness-paypal-sandbox`, accounts
`client_id`, `secret`, `email`, `password`. The LIVE pair stays in GCP Secret
Manager (`paypal-client-id`, `paypal-secret`) — two worlds, two stores, so
reaching for the wrong one by accident is hard. Nothing here can take real
money: every call is to `api-m.sandbox.paypal.com`.

## Spec proposals

`docs/specs/modules/wallets.md`, the paypal *Test:* paragraph, should gain a
second paragraph naming this harness: what it proves that jsdom cannot (P6's
runtime half, P10's runtime half, and the subscription reaching ACTIVE), that
it is **manual** — it needs the Keychain items, a network and PayPal's own UI,
which changes under us — and that it is therefore not in any automated run.

## State

Done: all four scripts written, run green for all three plans, proven red.
In flight: nothing.
Next: overseer reviews, lands, updates the spec on main, checks the 404.
Traps (with dates):
- 2026-10-23: the LAST approve click closes PayPal's popup. Waiting on the
  popup after it throws "Target page, context or browser has been closed",
  which reads as a page failure but is the harness racing PayPal. Wait on the
  main page; it outlives the popup.
- 2026-10-23: `#wallets` holds two iframes (the button and PayPal's own
  close-detector), so a bare `#wallets iframe` is a strict-mode violation.
  Take `iframe[title="PayPal"]`.
- 2026-10-23: playwright's snippet context in the browser tool is sandboxed —
  no `require`, no `process` — so it cannot read the Keychain. Hence a
  standalone script, which also keeps the password out of the transcript.
