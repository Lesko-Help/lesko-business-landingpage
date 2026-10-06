# Brief: fix-ip-with-token

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

URGENT PRODUCTION BREAK, caused by our own commit 265f225 (landed in 708f5ca).

Symptom, seen by Martin on the live site 2026-10-06 ~18:27 CEST at
https://leskobusiness.com/checkout?plan=monthly with a real Belgian
Mastercard: pressing Pay shows the red box "Something in the form was not
accepted: ip_address cannot be present with token_id". That is Recurly
answering 422 and our S4 validation branch turning it into a 400. No card
is charged, but NOBODY CAN BUY AT ALL. Every purchase attempt now fails.

Cause: buildPurchase() in worker.js puts billing_info.ip_address next to
billing_info.token_id. Recurly rejects the pair outright: a token already
carries the billing info, so no other billing_info field may accompany it.
Our test scripts/test-subscribe-build-purchase.js only asserted the shape
of the object we build, never that Recurly accepts it, so it stayed green
while production broke. That is exactly the "a test that reads its
expectation from the system under test only proves the system agrees with
itself" trap in the global CLAUDE.md.

Task 1 (do this first, alone, and report before starting anything else):
make the checkout work again. Remove the ip_address line from
buildPurchase() so the payload is what it was before 265f225. Keep the
function, keep its test, keep logDecline() and raillog.js (those are fine
and unrelated). Update the test to assert the NEW truth: ip_address is
never sent alongside token_id. Prove it red against current main (the test
must fail while the bad line is there) and green after. Keep the
plain-language comment on the function honest about why the field is absent.

Task 2 (only after task 1 is reported): find out where, if anywhere, the
buyer's IP legitimately goes on a Recurly v3 purchase made with a
Recurly.js token. Read Recurly's own API documentation; do not guess from
memory. Specifically answer, with a citation (URL + quoted line):
  (a) Is there any field on POST /purchases, the account, or the
      subscription that carries the cardholder IP when billing info comes
      from a token?
  (b) Does Recurly already capture the buyer's IP itself when Recurly.js
      tokenises the card in the browser? If so, the whole premise of
      265f225 was wrong and the gateway was never missing the IP -- say so
      plainly, because that also removes one of the three differences we
      thought existed between our API route and the old ClickFunnels route.
Write the answer into the brief. Do NOT implement anything for task 2
without reporting first.

Constraints: never press Pay or start a real transaction; the real card
test is Martin's. Never read the Recurly keys from the Mac keychain.
Report to the overseer and stop; it lands.

## Done when

Task 1: `node scripts/test-subscribe-build-purchase.js worker.js` proves
`ip_address` is never present on `billing_info` when `token_id` is present
— rewritten from today's shape (which only proved the IP-present /
IP-absent shape, never the Recurly rule). Red first: run the updated test
against the current, still-broken `worker.js` (must fail, since the bad
line is still there). Then remove the `ip_address` line from
`buildPurchase()` and run it again: green.

Task 2: no test — a written, cited answer to the two questions in the Goal,
added to this brief's Context section, reported before any code for task 2
is written (and in fact task 2 is not started in this report at all; see
below).

`Spec: unchanged in this report because the only correct spec text is the
opposite of the current `docs/specs/modules/worker.md` B2/S4 wording — see
Spec proposals below; the overseer applies it on main.`

## May touch

Module: `worker` (`docs/specs/modules/worker.md`) — `worker.js`'s
`buildPurchase()` and `subscribe()` S4 call site, and
`scripts/test-subscribe-build-purchase.js`. Nothing else.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — the overseer's `wt-done.sh`,
after landing. Production is actively broken (every purchase attempt
fails), so this is the urgent case the deploy notes call out: land and
deploy as soon as the overseer reviews it.

## Context

- Break first seen by Martin 2026-10-06 ~18:27 CEST on
  https://leskobusiness.com/checkout?plan=monthly, a real Belgian
  Mastercard, red box "Something in the form was not accepted: ip_address
  cannot be present with token_id". No charge attempted; Recurly 422 ->
  our S4 validation branch -> 400.
- Cause: commit `265f225` ("Send the buyer's IP to Recurly on every
  purchase attempt"), landed via `708f5ca`, added
  `billing_info.ip_address` next to `billing_info.token_id` in
  `buildPurchase()`. Recurly's v3 `/purchases` rejects that pair outright
  when billing info comes from a Recurly.js token — the token already
  carries billing info, so no sibling `billing_info` field is allowed.
- `scripts/test-subscribe-build-purchase.js` only ever asserted the shape
  of the object this repo builds, never that Recurly accepts it — the
  CLAUDE.md trap "a test that reads its expectation from the system under
  test only proves the system agrees with itself," named in the Goal.
- Overseer's memory-bank message: not received by the time this brief was
  committed (first commit on this branch). Will be folded in here if it
  arrives later.

## Spec proposals

`docs/specs/modules/worker.md` B2 (under `buildPurchase`) currently reads:
"sets `billing_info.ip_address` to the caller's IP ... only when the IP is
non-empty." That is the bug, written into the spec by `e6f50fa`/`9f77d5d`
alongside `265f225`. It should instead say: `billing_info.ip_address` is
never set — Recurly rejects `ip_address` alongside `token_id` (a token
already carries billing info), so B2 is deleted outright, not merely
conditioned on the IP being non-empty. The `*Examples:*` line should drop
the `ip_address` example entirely. S4's description ("the caller's IP as
`billing_info.ip_address` when Cloudflare supplied one") needs the same
correction. Where (if anywhere) the buyer's IP legitimately belongs on a
Recurly v3 token purchase is task 2 of this brief's Goal, still open —
the spec text above should not claim a replacement location until that is
answered and cited.

## State

Done: brief filled in and committed (this commit).
In flight: none — about to start Task 1 (remove `ip_address` line, update
test, prove red then green).
Next: Task 1 code + test, report to overseer; Task 2 only after that report.
Traps (with dates):
- 2026-10-06: a test that only asserts the shape of the payload this repo
  builds, and never checks the receiving API's own rules, can stay green
  while production is broken end to end — see `265f225` / this brief.
