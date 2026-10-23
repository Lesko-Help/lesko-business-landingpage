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

# Brief: paypal-lookup-window

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Shrink the PayPal address-lookup window from 4s to 1s (EMAIL_LOOKUP_MS), to cut the live double-charge window in which the card Pay button stays enabled after PayPal has already taken the money

## Done when

`scripts/test-wallet-paypal.sh .` green including the new check "the address
lookup cannot keep the card form live for more than 1.5 s", which goes red at
the old 4000. Proved both ways before landing.

Spec: docs/specs/modules/wallets.md unchanged by this task — P6 does not name a
timeout value. (It still needs the edits listed in
docs/briefs/paypal-email-guard.md, from the task before this one.)

## May touch

Module `wallets`: `assets/wallet-paypal.js` (one constant and its comment),
`scripts/test-wallet-paypal.mjs` (one check, EXPECTED_CHECKS).
NOT touched: `checkout.html` — exposing `busy()` on the seam is the proper fix
and belongs to its own task.

## Deploy implied

None of its own: a push to `main` IS the deploy (Cloudflare Workers Builds).

## Context

Landed 2026-10-23 in `83cc0a7`, the PayPal success path stopped calling
`finish()` synchronously and now awaits an address lookup first. `finish()` was
what set `busy(true, 'Payment received…')` and locked the page, so during the
lookup the page shows nothing new while a PayPal subscription already exists —
and the card "Pay" button stays enabled (confirmed enabled on the live page,
2026-10-23). A buyer who sees PayPal's window close and nothing happen can
press Pay and create a SECOND subscription, on the Recurly rail.

Found by an independent review, not by the author of `83cc0a7`. Martin chose
the one-line interim over the seam change: "or do the one-line interim first".

The trade-off, stated because the number is a judgement and not an invariant: a
PayPal call slower than 1 s now falls back to the typed address, or to '' when
the box was empty, so `/welcome` prints a placeholder instead of the real
login. A display loss buys back a second charge; never the reverse. PayPal's
own GET on a subscription normally answers well inside 1 s, but that was never
measured here — measuring it needs a live click.

## Spec proposals

None of its own. The list from `paypal-email-guard` is still outstanding (P5,
P9, the wallets.md Test paragraph which now says 57 checks and is at 69,
page.md:142, and the welcome.html placeholder copy).

## State

Saved 2026-10-23. DONE — green, landed.

Done:
- `assets/wallet-paypal.js`: `EMAIL_LOOKUP_MS` 4000 -> 1000, with the comment
  saying why the number is a double-charge window and what shortening it costs.
- `scripts/test-wallet-paypal.mjs`: one new check pinning the value at <= 1500,
  because the hang check cannot protect it (it allows anything inside its own
  slack, so 4000 passed it). EXPECTED_CHECKS 67 -> 68; the suite is 69 checks.
- Red proved by exit code, in a scratch copy: back to 4000 -> red on the new
  check; the give-up timer deleted entirely -> still red on the hang check at
  the shorter window. Baseline green before and after.
- Suites: wallet-paypal 69/0, ga4-events 34/0, wallet-seam 30/0,
  wallet-common 28/0.

Still open after this (NOT fixed here):
1. The real fix: expose `busy()` on the seam in `checkout.html` and call it
   before `paypalEmail()`, so the page locks the moment PayPal approves instead
   of merely locking sooner. Own task. Then `EMAIL_LOOKUP_MS` may go back up
   and the <= 1500 check above should be relaxed in the same commit.
2. The five spec places from `paypal-email-guard`.
3. The window is shorter, not gone: 1 s of a live card button after PayPal has
   taken the money.

Traps (with dates):
- 2026-10-23: `main` is production; the push IS the deploy.
- 2026-10-23: a test that reads a constant from source follows the constant —
  so it proves behaviour but NOT the value. Pin a value that is itself the
  point of a change with its own check, or a later edit undoes the change
  silently and the suite stays green.
- 2026-10-23: judge every red-proof by EXIT CODE, never by grepping FAIL — a
  crashed or early-exiting suite prints no FAIL line.
- 2026-10-23: `timeout` does not exist on this macOS box.
