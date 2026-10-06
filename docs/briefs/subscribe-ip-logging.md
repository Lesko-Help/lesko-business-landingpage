# Brief: subscribe-ip-logging

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Worker-only change to /api/subscribe. No page changes, no copy changes, nothing under docs/specs/.

WHY NOW: two real European cards (Martin's Belgian Mastercard and Giulia's) were declined on the live /checkout at $29.95 on 2026-10-06, both with Recurly error_code 'declined', decline_code 'generic_decline', Authorize.net gateway code 2 (= the issuer declined). Zero purchases have ever completed through /checkout since it went live 2026-09-30. Right now every decline is invisible after the fact: worker.js logs it with console.log, but wrangler.jsonc has no observability block, so nothing is retained. Each decline currently reaches us only as a screenshot from Martin.

THREE THINGS TO BUILD:

1. Send the buyer's IP address to Recurly.
   worker.js line 70 already reads request.headers.get('CF-Connecting-IP') for the rate limiter, then throws it away. The purchase payload built at worker.js:173-177 sends no IP at all.
   Recurly's API has billing_info.ip_address (a string), which Recurly's own client library marks 'STRONGLY RECOMMENDED'. Verify this against Recurly's current purchase/billing_info schema before writing it - do not take it on trust from this brief.
   Input: the Cloudflare CF-Connecting-IP header. Output: billing_info.ip_address on the POST /purchases body. Why: without it Authorize.net's own fraud filters (IP velocity, IP geolocation) cannot run at all, which matters because CLAUDE.md already records 'no bot check on /api/subscribe, card-testing risk' as a known accepted issue. Lift the IP out of withinSubscribeLimit so both the limiter and the purchase use one value.
   Be honest in the brief about what this does NOT do: it is very unlikely to turn a European decline into an approval, because those transactions reached the issuer and the issuer said no. This is correctness and fraud-defence, not the Europe fix.

2. Turn on Workers observability.
   wrangler.jsonc currently has assets and ratelimits but no observability block. Add one so the existing console.log lines in subscribe() are actually retained and readable.

3. Alert on every decline, per the standing rule in the global CLAUDE.md that unattended code reports its own failure.
   One structured JSON line at severity ERROR through a small alert helper kept in this repo (start from Lesko's raillog.py pattern, but this is a JS Worker so write the JS equivalent), in the form:
     BTB_ALERT lesko-business-landingpage/api-subscribe <CODE>: <what happened>
   Carry the plan code, the Recurly decline code and the Authorize.net gateway error code. Never log card data, never log the buyer's email, never log the buyer-facing message text - worker.js:206-208 already gets this right, keep it that way. Choose <CODE> from the fixed list in the global CLAUDE.md; a payment decline is most likely UNEXPECTED unless you can argue for a better one, and you may add a repo-specific code in the helper if you justify it in the brief.

CONSTRAINTS:
- Worker-only. Do not touch checkout.html, index.html, welcome.html or assets/.
- Any new non-page file must be added to .assetsignore, or it gets served publicly from leskobusiness.com (assets.directory is '.').
- Prove the alert can go red before trusting it green: show a decline producing the BTB_ALERT line.
- Do not add the Recurly Kount fraud_session_id. Checked 2026-10-06: Recurly Fraud Management is not available on the LeskoHelp plan ('Upgrade Required'), status Disabled, so it would be dead code.
- Report back to the overseer when done. Do not push to main.

## Done when

Three new scripts, each red (fails against `origin/main`, where the function
under test does not exist) then green (passes on this branch):

1. `node scripts/test-subscribe-build-purchase.js worker.js` — a new
   `buildPurchase(ip, plan, token, email, first, last, company, tds)`
   function in `worker.js` (factored out of `subscribe()`) sets
   `billing_info.ip_address` on the Recurly purchase payload when an IP is
   given, and omits it when the IP is `''`. Red: `buildPurchase` undefined
   on `origin/main` (the IP is built inline, never lifted into its own
   function, and never sent to Recurly at all).
2. `node scripts/test-raillog-alert.js raillog.js` — `raillog.js`'s
   `alert(runnable, code, what)` prints exactly one line,
   `console.error(JSON.stringify({severity:'ERROR', message:'BTB_ALERT
   lesko-business-landingpage/<runnable> <CODE>: <what>'}))`, and throws on
   a code outside its fixed allow-list. Red: `raillog.js` does not exist on
   `origin/main`.
3. `node scripts/test-subscribe-decline-alert.js worker.js raillog.js` — a
   new `logDecline(plan, te)` in `worker.js`, called from the
   `transaction_error` branch of `subscribe()` in place of today's
   `console.log('subscribe declined', ...)`, calls `alert('api-subscribe',
   'PAYMENT_DECLINED', ...)` carrying the plan code, Recurly's `code` and
   `gateway_error_code` — never `te.message`, never the buyer's email. Red:
   `logDecline` undefined on `origin/main`.

Additionally, `npx wrangler deploy --dry-run` must exit 0 both before and
after the `wrangler.jsonc` observability block is added (task 2) — it
validates the config schema and bundles the new `raillog.js` import
offline, no Cloudflare account needed (checked 2026-10-06: dry-run needs no
auth against this repo's current `wrangler.jsonc`).

Spec: unchanged because `worker.md` is the overseer's to edit, not this
worktree's (DECISION BY MARTIN 2026-09-24) — the divergences from its
Functions section (S1/S4/S5 below) are written up under `Spec proposals`
for the overseer to apply.

## May touch

Module: `worker` (`docs/specs/modules/worker.md`).
- `worker.js` — lift the caller IP out of `withinSubscribeLimit`, add
  `billing_info.ip_address` to the Recurly purchase, add `logDecline()`,
  import `raillog.js`.
- `raillog.js` (new file, repo root — alongside `worker.js`, since Workers
  modules only split via ES `import`/`export`, no CommonJS) — the alert
  helper.
- `wrangler.jsonc` — add the `observability` block.
- `.assetsignore` — add `raillog.js` next to the existing `worker.js` line,
  or it is served publicly (same reason `worker.js` is already listed).
- `scripts/test-subscribe-build-purchase.js`, `scripts/test-raillog-alert.js`,
  `scripts/test-subscribe-decline-alert.js` (new) and
  `scripts/test-decline-reasons.js` (edit — strip the new `import` line
  before running `worker.js`'s body in its `vm` sandbox, or that existing
  test's load step throws a `SyntaxError` and fails for an unrelated
  reason).

Out of scope (constraint from the goal): `checkout.html`, `index.html`,
`welcome.html`, `assets/`, anything under `docs/specs/`.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — the overseer's to run, after
Martin says "land it". No Worker secret or dashboard step needed; the three
existing secrets/bindings are untouched.

## Context

- Overseer's memory message: none arrived before this brief was committed.
  (wt-new.sh did not relay a retrieve_memories result for this goal by the
  time this file was written; added below if it arrives later.)
- WHY NOW, measured 2026-10-06: two real European cards (Martin's Belgian
  Mastercard, Giulia's) declined on live `/checkout` at $29.95, both Recurly
  `error_code: declined`, `decline_code: generic_decline`, Authorize.net
  gateway code 2 (issuer declined). Zero purchases have completed through
  `/checkout` since go-live 2026-09-30.
- Recurly schema check 2026-10-06 (brief's instruction: verify, don't take
  on trust): `billing_info.ip_address` is a real field on Recurly's v3
  purchases API (v2021-02-25), type string, marked *STRONGLY RECOMMENDED*
  by Recurly's own client libraries (confirmed against
  `recurly-client-go`'s `billing_info_create.go`, tag `v3-v2021-02-25`).
  Docs quote a 20-character max for the update-billing-info endpoint, which
  is shorter than some valid IPv6 text forms; `clean(ip, 45)` is used
  instead (45 covers the longest IPv6 text form) rather than trusting that
  20-char figure for a different endpoint.
- Cloudflare Workers observability check 2026-10-06: `wrangler.jsonc`'s
  `observability.head_sampling_rate` defaults to `1` (100%) when the block
  is omitted entirely, but is set explicitly here — an alert line must
  never be silently sampled out.
- `PAYMENT_DECLINED` is a repo-specific addition to the fixed
  `AUTH_FAILED`/`SOURCE_FAILED`/`SOURCE_EMPTY`/`ASSERTION_FAILED`/`QUOTA`/
  `STALE`/`UNEXPECTED` list in the global `CLAUDE.md`, kept inside
  `raillog.js`'s own allow-list rather than folded into `UNEXPECTED`:
  on 2026-10-06 a decline was 100% of real purchase attempts, so grouping
  it under `UNEXPECTED` would make `UNEXPECTED` useless for spotting an
  actual bug once declines are the common, expected inbox entry.
- Cloudflare Workers has no GCP-style auto severity detection the way Cloud
  Run does (confirmed 2026-10-06), so `raillog.js`'s `alert()` calls
  `console.error`, not `console.log`, so Workers Logs' own level filter
  also marks the line as an error, in addition to the JSON `severity` key
  kept for text-shape parity with every other repo's `BTB_ALERT` line.

## Spec proposals

`docs/specs/modules/worker.md`'s Functions section, once this lands:
- S1 (`withinSubscribeLimit`): now takes `(ip, env)`, not `(request, env)` —
  the caller IP is read once in `subscribe()` and passed to both the
  limiter and the purchase payload, not re-read from the header twice.
- New subsection, `buildPurchase(ip, plan, token, email, first, last,
  company, tds)`: builds the exact object POSTed to `/purchases`; sets
  `billing_info.ip_address` to the cleaned caller IP when non-empty.
- S4: the purchase payload now includes `billing_info.ip_address` (the
  `CF-Connecting-IP` header), when Cloudflare supplied one.
- S5: a decline now also prints one `BTB_ALERT
  lesko-business-landingpage/api-subscribe PAYMENT_DECLINED: …` line (via
  new function `logDecline(plan, te)`), carrying `plan`, `te.code`,
  `te.gateway_error_code` — never `te.message`, never the email — in
  addition to the `console.log` line already there. This is new: S5
  currently says only "the worker never logs the email or card data
  itself", with no mention of an alert; the Errors note "failures are shown
  to the buyer, not alerted — a person is at the page; no `BTB_ALERT`" is
  now wrong for the decline case specifically (it still holds for 400/429/
  503/502 — those stay buyer-only, not alerted).
- New file `raillog.js` would get its own module spec entry (`Writes:` line
  changed from "nothing of its own" — it now writes the one `BTB_ALERT`
  line per decline), or a `Functions` subsection added to `worker.md` if the
  overseer judges a whole separate module spec is overkill for one function.
- `wrangler.jsonc`'s Overview line "What it owns" would gain "the
  `observability` block".

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done (2026-10-06):
- Brief filled in and committed (`6270b61`).
- Wrote three red-then-green test scripts, proved each red against the
  worker.js on this branch before any code change: `scripts/
  test-subscribe-build-purchase.js`, `scripts/test-raillog-alert.js`,
  `scripts/test-subscribe-decline-alert.js`.
- Task 1 (send the IP to Recurly) implemented in `worker.js`: added
  `callerIp(request)`, changed `withinSubscribeLimit` to take `(ip, env)`
  instead of `(request, env)`, added `buildPurchase(ip, plan, token,
  email, first, last, company, tds)` (sets `billing_info.ip_address` when
  `ip` is non-empty, via `clean(ip, 45)`), `subscribe()` now computes `ip`
  once and passes it to both. NOT YET COMMITTED. Proved green: `node
  scripts/test-subscribe-build-purchase.js worker.js` → all PASS, exit 0.

In flight: nothing mid-edit right now; the task-1 worker.js edit above is
done and tested but still uncommitted, sitting in the working tree.

Next:
1. `git add worker.js scripts/test-subscribe-build-purchase.js` and commit
   task 1 (one commit: "lift the IP ... send billing_info.ip_address").
2. Task 2: add the `observability` block to `wrangler.jsonc` (`{"enabled":
   true, "head_sampling_rate": 1}`, see Context above for why both keys are
   explicit). Prove `npx wrangler deploy --dry-run` still exits 0 before
   AND after (it already exits 0 unmodified — checked 2026-10-06, baseline
   run, no account/auth needed). Commit alone.
3. Task 3: write `raillog.js` (exports `ALERT_CODES`, `alert(runnable,
   code, what)` — see brief's Context for the exact shape:
   `console.error(JSON.stringify({severity:'ERROR', message:'BTB_ALERT
   lesko-business-landingpage/<runnable> <CODE>: <what>'}))`, throws on an
   unlisted code, `PAYMENT_DECLINED` added to the fixed 7). Run `node
   scripts/test-raillog-alert.js raillog.js`, confirm green (it is red
   right now — file does not exist).
4. Wire it: in `worker.js`, add `import { alert } from './raillog.js';` at
   the top, add `logDecline(plan, te)` (calls `alert('api-subscribe',
   'PAYMENT_DECLINED', ...)` with plan/code/gateway_error_code, never
   `te.message`), replace the `console.log('subscribe declined', ...)`
   line in the `transaction_error` branch of `subscribe()` with
   `logDecline(plan, te)`. Run `node scripts/test-subscribe-decline-alert.js
   worker.js raillog.js`, confirm green (currently red). Also fix
   `scripts/test-decline-reasons.js` so it still passes: it vm-runs
   worker.js's body by cutting at `export default`, and the new leading
   `import` line will throw a SyntaxError in that vm context — strip it
   the same way the three new test scripts do (`source.replace(/^import\s
   +.*?;\s*$/m, '')`) before the existing cut-at-`export default` step, and
   add `sandbox.alert = () => {};` before running (that test only cares
   about `declineMessage`, not `alert`). Run `node scripts/
   test-decline-reasons.js worker.js`, confirm still green (12/12).
   Add `raillog.js` to `.assetsignore`, next to the existing `worker.js`
   line. One commit for all of task 3 (helper + wiring are one idea: "alert
   on every decline").
5. Re-run all four scripts once more together to confirm nothing regressed,
   then `npx wrangler deploy --dry-run` once more (bundles the new
   raillog.js import — this is the only check that the ES import itself is
   wired correctly for a real deploy).
6. `git add -N .`, `git status` clean, `git fetch && git merge origin/main`
   (should be a no-op — `origin/main` has not moved since this branch
   started), update `docs/gates/` if this repo has any (none seen so far —
   check `ls docs/gates/` once before skipping).
7. `wt-done.sh --check subscribe-ip-logging`, fix anything it refuses on,
   re-run until exit 0.
8. SendMessage to `landing-opzichter` (the overseer) — branch, commit
   range, HEAD sha, 5-line summary, how done-when was proven red-then-
   green, deploy implications (push to main via Workers Builds; no new
   secret or dashboard step). Then stop and wait.

Traps (with dates):
- 2026-10-06: worker.js gained a leading ES `import` line (task 3). Any
  future vm-based test of worker.js's body (the `export default` cut
  trick) must strip that import line first, or the vm load throws
  `SyntaxError: Cannot use import statement outside a module` for an
  unrelated reason. `scripts/test-decline-reasons.js` needed exactly this
  fix (see Next, item 4).
- 2026-10-06: `wrangler deploy --dry-run` needs no Cloudflare login/
  account for this repo's current config (checked against baseline before
  any change) — safe to use as the "does it still bundle/validate" guard
  for `wrangler.jsonc` and the new `raillog.js` import without touching
  production.
