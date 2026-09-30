# Brief: decline-reasons

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

When Recurly declines a card at /checkout (the gateway behind it is Authorize.net), show the buyer the actual reason in plain words plus what to do, instead of Recurly's generic text. DECISION BY MARTIN 2026-09-30: show the buyer the reason (not GA4 events, not a report). In worker.js only: a small function that takes Recurly's transaction_error (code, category, message, merchant_advice, gateway_error_code — check Recurly v2021-02-25 docs for the real field names and code list) and returns a buyer message: e.g. insufficient funds, expired card, wrong CVV, address/ZIP does not match the card (AVS), card number invalid, card type not accepted, bank wants you to call it, gateway temporarily unavailable (try again in a minute), duplicate transaction; unknown codes fall back to Recurly's message, then to today's generic text. Never reveal fraud-rule details beyond 'check the billing address/ZIP' or 'try another card'. Log the code and gateway_error_code with console.log (no email, no card data). checkout.html already shows result.message; do not change it. Test first: a node script under scripts/ that runs the mapping on sample error objects, red against origin/main, green on the branch; paste output in the brief. Plain-language comment on every function touched. Do not touch Cloudflare, Recurly or secrets; do not push. Add the new behaviour to the brief's spec proposal for /api/subscribe.

## Done when

`scripts/test-decline-reasons.js`: loads `declineMessage()` out of a given
`worker.js` (as a plain script in a `vm` context — see the script's own
comment for why, since this repo has no `package.json` and `worker.js` is an
ES module) and checks 12 sample `transaction_error` objects each map to the
expected buyer-facing text (insufficient funds, expired card, wrong CVV,
AVS mismatch, invalid card number, card type not accepted, bank wants a
call, gateway unavailable, duplicate transaction, an unlisted `fraud_*` code
falling back to the two safe hints only — not the gateway's own message
text, an unknown non-fraud code falling back to Recurly's `message`, and no
data at all falling back to today's generic text).

Red against `origin/main` (`2a1ae8a`, via a `git archive` scratch copy):
`declineMessage` does not exist yet, script exits 1.
Green on this branch: all 12 cases pass, script exits 0.
Output of both runs pasted in `## Context` below.

Spec: docs/specs/modules/worker.md updated (proposal below, for the
overseer to fold in — this worktree does not edit docs/specs/ itself).

## May touch

Module: **worker** (`worker.js` + the `main` entry in `wrangler.jsonc`, see
`docs/specs/modules/worker.md`).

- `worker.js` — add `DECLINE_MESSAGES`, `FRAUD_FALLBACK` and
  `declineMessage(te)`; use it in `subscribe()`'s decline branch in place of
  `te.message || '<generic>'`; change that branch's `console.log` to log
  `te.code` and `te.gateway_error_code` only (drop the raw message from the
  log line).
- `scripts/test-decline-reasons.js` (new) — the red/green proof.
- `docs/briefs/decline-reasons.md` — this file.

Not in scope: Cloudflare dashboard, Recurly, any secret, any other route,
`checkout.html` (confirmed unchanged below), `index.html`, `wrangler.jsonc`,
`main` branch, any deploy.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — same as every change here. The
worktree session does not push or deploy; the overseer does, from `main`,
after landing. No Cloudflare dashboard step needed: this is a pure code
change to an existing route, no new binding or secret.

## Context

Overseer memory message, received mid-session (after the code was already
written and tested — the brief documents this out of the usual order below):

> Overseer context for decline-reasons (memory bank, 2026-09-30):
> - DECISION BY MARTIN 2026-09-30: show the buyer the reason for a decline.
>   No GA4 decline events and no report.
> - The branded /checkout went live 13:20Z (445c364). The /api/subscribe
>   route has NOT been proven end to end yet; Martin's first real $29.95
>   purchase is still pending. Treat the transaction_error shape as coming
>   from the docs, not from a real response.
> - The rate limit (SUBSCRIBE_LIMIT, 5/60s, a 429 checked first) is live.
>   Leave it as it is. Enforcement is loose (per location): the first 429
>   came at about call 21. Don't rely on it in tests against live.
> - Traps: a push to main is the deploy, so no push. Branch Workers Builds
>   always fail. Any new file under scripts/ is already covered by
>   `.assetsignore` (`scripts/`). Never put the email or card data in logs.
> - checkout.html shows result.message for any status. Keep it unchanged.

This matches what was independently found below (checkout.html unchanged,
no push, no secrets) — nothing here changed the implementation.

Recurly's `transaction_error` field names and code list, fetched 2026-09-30
from `docs.recurly.com/recurly-subscriptions/docs/api-transaction-errors`
(API v2021-02-25): the object has `object`, `transaction_id`, `category`,
`code`, `message`, `merchant_advice`, and (when a 3-D Secure check is
required instead of a decline) `three_d_secure_action_token_id` sits on the
outer error, not inside `transaction_error` — matching what `worker.js`
already does at line ~126 (`err.three_d_secure_action_token_id`, handled
before the `transaction_error` branch, unchanged by this task).
`gateway_error_code` (the gateway's own raw code) was confirmed via the
`recurly-client-go` v2021-02-25 source and the `TransactionError` struct
fields cited across Recurly's client libraries. The full code table (~150
codes across categories Approved/Soft/Hard/Fraud/Configuration/
Communication/Duplicate/ThreeDSecure*/Amazon/Unknown/ApiError/Skles/
RecurringMandateCancelled) was fetched in full; the ones the goal names by
example, plus their close relatives in the table, are the ones mapped by
name in `worker.js`; everything else uses the fallback chain (fraud_* code
→ safe hint; other code → Recurly's own `message`; nothing → generic text).
Recurly's own `message` text for every code in the table is already written
for a buyer/merchant UI and does not, by inspection, name a specific
fraud-detection reason — the safe-fallback-for-unlisted-fraud-codes rule in
the goal is a guarantee against a *future* code Recurly might add, not a fix
for an existing leak.

`checkout.html`: `git diff HEAD -- checkout.html` is empty — confirmed
unchanged, as the goal requires. `finish()` (checkout.html:324-345) already
calls `showError(result.message || '<generic>')` for any non-ok JSON body
regardless of status code, so the new `declineMessage()` text reaches the
buyer through the same 402 response path a decline already used.

Test script output, `node scripts/test-decline-reasons.js <path>`,
2026-09-30:

Red, against `origin/main` (`2a1ae8a`, via `git archive origin/main | tar -x`
into a scratch dir):
```
FAIL: declineMessage is not defined in <scratch>/worker.js
```
(exit code 1 — proves today's worker has no decline-reason mapping.)

Green, on this branch, run against the repo's own `worker.js`:
```
PASS (insufficient funds): Your card was declined for insufficient funds. Please try a different card or contact your bank.
PASS (expired card): Your card has expired. Please use a different card.
PASS (wrong CVV): The security code (CVV) does not match your card. Please check it and try again.
PASS (AVS mismatch): The billing address or ZIP code does not match your card. Please check it and try again.
PASS (invalid card number): That card number is not valid. Please check it and try again.
PASS (card type not accepted): That card type is not accepted here. Please try a different card.
PASS (bank wants a call): Your bank wants you to call them before this card can be used here. Please contact your bank, or try a different card.
PASS (gateway unavailable): The payment system is temporarily unavailable. Please try again in a minute.
PASS (duplicate transaction): This looks like the same charge was just submitted. Please wait a few minutes and try again.
PASS (unlisted fraud code hides gateway detail): Your card was declined. Please check your billing address and ZIP code, or try a different card.
PASS (unknown code falls back to Recurly message): Recurly wrote this for you
PASS (no data falls back to generic text): Your card was declined. Please try another card or contact your bank.
PASS: all 12 decline-reason cases mapped as expected
```
(exit code 0.)

## Spec proposals

Proposed addition to `docs/specs/modules/worker.md`'s `## Functions`
section, as a new `### declineMessage` entry (the file currently documents
only `fetch`'s `/api/videos` branch; the `subscribe`/`config` entries were
already proposed by the `subscribe-rate-limit` brief and are still pending
the overseer folding them in — this is additive to that proposal, not a
replacement):

> ### declineMessage(transactionError) — used inside `subscribe()`'s decline branch
>
> *What it does:*
> - D1: given Recurly's `transaction_error` object (`code`, `category`,
>   `message`, `merchant_advice`, `gateway_error_code`), returns a
>   plain-language string safe to show the buyer.
> - D2: a known `code` (insufficient funds, expired card, wrong CVV, AVS
>   mismatch, invalid card number, card type not accepted, bank wants a
>   call, gateway temporarily unavailable, duplicate transaction — see
>   `DECLINE_MESSAGES` in `worker.js` for the full code list) returns that
>   code's own message.
> - D3: an unlisted `fraud_*` code returns one of two fixed hints only
>   ("check your billing address and ZIP" or "try a different card") —
>   never Recurly's own message for that code, so a future fraud code never
>   leaks a fraud-rule detail to whoever triggered it.
> - D4: any other unlisted code falls back to Recurly's own `message`; no
>   code and no message at all falls back to the pre-existing generic line
>   ("Your card was declined. Please try another card or contact your
>   bank.").
> - D5: `subscribe()`'s decline branch logs `plan`, `te.code` and
>   `te.gateway_error_code` only via `console.log` — never the buyer-facing
>   message, the email, or any card data.
>
> *Inputs:* the `transaction_error` object from a Recurly purchase decline
> (any field may be missing).
>
> *Outputs:* a plain-language string.
>
> *Why fraud codes are capped at two hints:* the goal (DECISION BY MARTIN
> 2026-09-30) is to help a genuine buyer without teaching a card-testing
> script which fraud rule caught it.
>
> *Test:* `scripts/test-decline-reasons.js` — 12 sample `transaction_error`
> objects through `declineMessage()`, loaded out of a given `worker.js` via
> a stripped-script `vm` context (see the script's own comment for why: no
> `package.json` in this repo, and `worker.js` is an ES module).

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done: brief filled in; `worker.js` gained `DECLINE_MESSAGES`, `FRAUD_FALLBACK`
and `declineMessage(te)`, wired into `subscribe()`'s decline branch in place
of raw `te.message`; the decline branch's `console.log` now logs `code` and
`gateway_error_code` only; `scripts/test-decline-reasons.js` written and
proven red (scratch copy of `origin/main`) then green (this branch), output
in `## Context`; `checkout.html` confirmed unchanged; spec proposal written
into this brief; overseer's memory message received and folded in above.
Next: merge `origin/main`, run `wt-done.sh --check`, report to the overseer.
Traps (with dates):
- 2026-09-30: this repo has no `package.json`, and `worker.js` uses
  `export default` (ES module syntax) with no other exports — a Node test
  script cannot `import()` it directly. Strip the source at
  `export default` and run the rest via `vm.runInContext` in a throwaway
  sandbox instead of changing `worker.js`'s module shape.
- 2026-09-30: `/api/subscribe` is not yet proven against a real Recurly
  decline (first real purchase still pending per the overseer) — this
  task's proof is code-path/unit-level against the documented
  `transaction_error` shape, not a live-browser decline.
