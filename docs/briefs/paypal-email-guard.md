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

Added 2026-10-23 after an independent review found this list short by four
places. All four verified against `main`'s spec text:
4. **P9** (wallets.md:86) still describes the whole refusal: "`onClick` sends
   `wallet_click` first, then, if P6 refuses the click, `wallet_click_refused`
   … before `actions.reject()`", "`onError` … sends nothing for our own
   missing-email throw", and "`onApprove` is unchanged". None of that is true
   now; `onApprove` takes `actions` and returns a promise.
5. **P5** (wallets.md:82) says `onApprove` "fires GA4 `add_payment_info` then
   `LeskoCheckout.finish(...)`". There is now an awaited address lookup
   between the two, and `onApprove` takes `(data, actions)`.
6. **The wallets.md Test paragraph** (wallets.md:94) says "57 checks", claims
   "P6 (no email → no subscription created and a named error)" — the opposite
   of what P6 now is — and claims one check "requires the names it sends to be
   exactly those four, each used once". It is 68 checks, and PayPal sends three.
7. **page.md:142** says `test-ga4-events.sh` "watches the four PayPal wallet
   funnel events … arrive". It now watches three arrive and one NOT arrive.
8. **welcome.html copy, a new reachable state this change creates.** When
   PayPal gives no address AND the box was empty, `/welcome` shows its
   placeholder "the email you entered on the payment page" (welcome.html:53)
   and "as entered on the payment page" (welcome.html:74) — to a buyer who
   entered none. It does not break (regex guard at welcome.html:137). Out of
   this task's May-touch and it is Giulia's copy, so it is left for the
   overseer: a wording that covers "the email on your PayPal account" too.

## State

Saved 2026-10-23, after an independent review (fresh Fable session, read-only).
DONE — green, committed, NOT landed.

Done:
- `84284ec` — the change itself (see the commit message).
- `d2b30e2`, `3c60b2e` — this brief.
- `1eeb01f` — the two review findings worth fixing in code, both reproduced
  here before fixing:
  * the try/catch around `track()` inside `onApprove` was load-bearing and
    UNTESTED. Removing it left the suite green at 67/67, exit 0. It matters
    because PayPal routes a rejected `onApprove` promise to `onError`, so a
    throwing `track()` would tell a buyer who has already paid "PayPal did not
    go through" and never navigate. Now pinned; removing the try/catch fails
    with `outcome: "rejected"`, `nav: null`.
  * the `EXPECTED_CHECKS` comment claimed node "exited 0" on an unsettled
    promise. That was never verified — it came from a red-proof that only
    grepped for FAIL instead of reading the exit code — and the review could
    not reproduce it (node v26 exits 13). Comment now claims only what the
    guard covers: a deleted check or an early return. Proved by deleting one.
- Suites, all by exit code: wallet-paypal 68/0, ga4-events 34/0,
  wallet-seam 30/0, wallet-common 28/0.
- Review confirmed every premise this task rested on, independently:
  provisioning reads `subscriber.email_address` at
  `lesko-provisioning/webhooks/rails.py:489-492` and never sees the typed box;
  `actions.subscription.get()` is real in the live smart-buttons bundle for
  this client id under `vault=true&intent=subscription`, returning the raw
  resource with `subscriber.email_address`; wallet-common.js's C3 refusal is
  correctly left alone because it guards `POST /api/subscribe`, where Recurly's
  account code IS the email; and both refused clicks in GA4 produced no later
  `purchase`.

Open, NOT fixed here, in severity order:
1. **A double-charge window, PLAUSIBLE, needs a decision.** `finish()` used to
   run synchronously in `onApprove` and immediately set `busy(true, 'Payment
   received…')`. Now the address lookup runs first (up to EMAIL_LOOKUP_MS =
   4 s), and the seam exposes no `busy()` (checkout.html:488-495), so the page
   looks idle and the card "Pay" button stays live while a PayPal subscription
   already exists. A buyer could press Pay and start a SECOND subscription on
   the Recurly rail. Unmeasured — timing it needs a live click. Fix is to show
   a neutral "payment received" state before the lookup, which means exposing
   `busy` on the seam in `checkout.html` — outside this task's May-touch, so
   it wants its own worktree. Cheaper interim: drop EMAIL_LOOKUP_MS.
2. The four spec places above (P5, P9, wallets.md Test, page.md:142) plus the
   welcome.html copy — items 4-8 under Spec proposals.
3. `84284ec` bundles three ideas (remove the refusal, add the lookup, harden
   the suite) against "one idea per commit". Noted, not rewritten: the branch
   is under review and rewriting history mid-review costs more than it buys.
4. GA4 continuity: `wallet_click_refused` stops being emitted by any live
   wallet as of 2026-10-23 (Apple/Google Pay are off). `wallet_click`, the
   denominator, is unchanged. Anyone charting refusals should know the series
   ends. Not a bug.

Next (overseer / Martin, not this worktree):
1. Review `git diff origin/main...HEAD` and land with `wt-done.sh
   paypal-email-guard` — landing IS the deploy here.
2. Decide on the double-charge window above before or right after landing.
3. Apply the spec edits on `main`; code and spec disagree until then.
4. After landing, click PayPal on all three plans with the email box EMPTY and
   confirm PayPal's window opens. Needs real Chrome; headless gets a
   Cloudflare 403 on leskohelp.com (leskobusiness.com itself is fine).

Traps (with dates):
- 2026-10-23: `main` is production here; a push to main deploys in a minute.
  This worktree never pushes to main.
- 2026-10-23: **a suite can pass by not finishing, and a crash prints no FAIL
  line.** Judge every red-proof by EXIT CODE, never by grepping FAIL. Three
  separate times on this task a break looked green that way: an unsettled
  promise, a rejection aborting a block, and a mutant that never applied.
  Belts now: `outcomeWithin()` (names ok/rejected/timeout, never throws) and
  the `EXPECTED_CHECKS` tail guard. Raise EXPECTED_CHECKS (now 67, counting
  everything but itself) in the same commit that adds a check.
- 2026-10-23: `timeout` does not exist on macOS — a red-proof wrapped in it
  silently never ran and looked green.
- 2026-10-23: do not split shell strings on `|` when the pattern contains
  `||`; one red-proof garbled its own break that way and still went red, for
  the wrong reason. Use python for mutants.
- 2026-10-23: a removed try/catch can leave a suite green at the SAME check
  count. Count is not coverage.
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
