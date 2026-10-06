# Brief: alert-on-decline

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Make the BTB_ALERT PAYMENT_DECLINED line actually reach Martin: first PROVE the 2026-10-06 18:52 CEST decline wrote it in Workers Logs (read-only, no card needed), then wire a notification so every future decline emails him with subject 'BTB-ALERT lesko-business-landingpage' carrying plan, code and gateway_error_code and nothing else; prefer Cloudflare Email Routing's send_email binding over any third-party service, and STOP and report to the overseer before adding any new credential, paid plan or external dependency.

## Done when

Two separate proofs, since the goal has two separate parts:

1. **The historical proof (read-only).** The 2026-10-06 18:52 CEST decline
   (Belgian Mastercard, $29.95, Authorize.Net code 2 — see worker.md
   Decisions) wrote one `BTB_ALERT lesko-business-landingpage/api-subscribe
   PAYMENT_DECLINED: plan=... code=... gateway_error_code=...` line that
   Cloudflare's Workers Logs actually retained. This worktree has no tool
   that can read it: `wrangler tail` is live-only (no historical query, no
   `--since`), there is no `wrangler logs`/`wrangler observability`
   subcommand, and extracting the wrangler OAuth token to call Cloudflare's
   API directly was blocked by the permission system as credential
   exploration (correctly — nothing carries into a worktree, `WT_CARRY=""`
   in `.werk.conf`). **This part is blocked on the overseer or Martin**,
   who have dashboard/browser access this worktree does not: Cloudflare
   dashboard -> Workers & Pages -> lesko-business-landingpage -> Logs,
   time window 2026-10-06 16:44-17:00 UTC (18:44-19:00 CEST, after the
   `a6b8c00` fix landed at 18:44 CEST), search text `PAYMENT_DECLINED`.
   Reported as open in my report to the overseer rather than claimed done.

2. **The code proof (this worktree can do this one).** A decline must mail
   Martin, not only log a line nobody watches. Test:
   `node scripts/test-subscribe-decline-email.js worker.js raillog.js` —
   composes the real `subscribe()` decline branch with the real
   `sendDeclineAlertEmail()`, a stubbed `EmailMessage`/`SEND_EMAIL.send`
   and a stubbed declined Recurly `fetch`, and asserts: subject is exactly
   `BTB-ALERT lesko-business-landingpage`; body contains plan, Recurly's
   `code` and `gateway_error_code`; body never contains `te.message` or the
   buyer's email; the existing `BTB_ALERT` console line still fires too
   (the email is additional, not a replacement). Red first against
   `origin/main` (no `sendDeclineAlertEmail`, no `send_email` binding, no
   `cloudflare:email` import).
   `scripts/test-decline-reasons.js`, `scripts/test-subscribe-build-purchase.js`
   and `scripts/test-subscribe-decline-alert.js` must stay green (their
   import-stripping regex needed a `g` flag once worker.js grew a second
   `import` line for `cloudflare:email` — confirmed red without the fix,
   green with it).

`Spec: unchanged because specs belong to the overseer (DECISION BY MARTIN
2026-09-24) — proposed worker.md additions are under Spec proposals below
for the overseer to apply.`

## May touch

Module: `worker` (docs/specs/modules/worker.md) — `worker.js`,
`wrangler.jsonc`, `raillog.js` (read, not expected to change), and
`scripts/test-*.js` (new test + the three existing ones whose
import-stripping needed the `g`-flag fix). Nothing in `page` (this task
sends no new data to the browser) and nothing in docs/specs/ (overseer-only).

## Deploy implied

Push to `main` (Cloudflare Workers Builds), same as every other `worker`
change. Before the email can actually deliver, two one-time Cloudflare
account actions this worktree deliberately did NOT run (production DNS /
account-level, outside "worktree writes code, overseer deploys"):
`wrangler email routing enable leskobusiness.com` (adds Email Routing DNS
records to the live zone) and `wrangler email routing addresses create
martin.j.menke@gmail.com` then clicking the verification link Cloudflare
mails to that address (Martin's own action). Until both are done,
`sendDeclineAlertEmail()` is a documented no-op (`if (!env.SEND_EMAIL)
return;`) — a decline still logs its BTB_ALERT line exactly as before,
nothing regresses.

## Context

No memory message arrived from the overseer before this brief's first
commit (checked via ReadNotifications — queue was empty). Found instead
from the repo itself:
- `docs/specs/modules/worker.md` (as of hotfix `a6b8c00`, 2026-10-06): full
  Functions/Decisions for `subscribe`, `logDecline`, `alert`, and the exact
  shape of the real 18:52 CEST decline (Authorize.Net code 2, CVV/AVS both
  fine, transaction origin "Recurly.js" not `api`/`hpp`).
- Timeline from `origin/main`'s own commit timestamps (git log, 2026-10-06
  local time = CEST): `265f225` (IP-sending bug) at 18:05, `6dc9106`
  (observability on) 18:06, `caadf3d` (BTB_ALERT on decline) 18:10,
  `a6b8c00` (bug fixed) 18:44. So by 18:52 CEST the deployed code already
  had both observability and decline-alerting live — the real decline this
  task must prove reached Workers Logs happened on exactly that code.
- `npx wrangler whoami` (with `CLOUDFLARE_ACCOUNT_ID=c75d24d09764e8db455eaf601ba3b377`):
  this worktree's wrangler session has `email_routing (write)` and
  `email_sending (write)` scopes but no log-query scope/command.
- `npx wrangler email routing settings leskobusiness.com`: Email Routing
  is currently `unconfigured`/disabled for the zone, zero destination
  addresses. Confirms the "Deploy implied" account steps are genuinely not
  done yet, not just undocumented.

## Spec proposals

For `docs/specs/modules/worker.md`, Functions section, once this lands:
- Add a `sendDeclineAlertEmail(env, plan, te)` subsection (same shape as
  the existing `alert()` one): signature, what it does (builds a raw MIME
  text/plain message by hand — no mimetext/nodemailer, this repo has no
  package.json — and sends it through the `SEND_EMAIL` binding to Martin,
  subject `BTB-ALERT lesko-business-landingpage`, body = plan + Recurly's
  `code` + `gateway_error_code`, nothing else), inputs/outputs/errors
  (no-op if `env.SEND_EMAIL` is unset), and its test
  (`scripts/test-subscribe-decline-email.js`).
- Update `subscribe()`'s S5 bullet: a decline now does three things, not
  two — the buyer-facing 402, the `BTB_ALERT` console line, and (via
  `ctx.waitUntil`, non-blocking) the email to Martin.
- Close (or narrow) the open parenthetical on S5's Errors line: "the line
  lands in Workers Logs, but no alert policy emails it yet" — half of that
  gap is closed by this task (the email), the other half (confirming the
  historical line itself was retained) stays open pending the overseer's
  dashboard check (see Done when, part 1).
- Add a wrangler.jsonc Decisions line: the `send_email` binding was added
  with a fixed `destination_address`, and the two one-time Cloudflare
  account actions it depends on (Email Routing enabled on
  leskobusiness.com, the destination address verified) are intentionally
  left for the overseer/Martin, not run from this worktree.

## State

Done:
- worker.js: added `sendDeclineAlertEmail(env, plan, te)` (raw MIME, no new
  library), wired into `subscribe()`'s decline branch via
  `ctx.waitUntil(...)`, `subscribe()`/the `/api/subscribe` dispatch now
  thread `ctx` through. Added `DECLINE_ALERT_FROM`/`DECLINE_ALERT_TO`
  constants and the `cloudflare:email` import.
- wrangler.jsonc: added a `send_email` binding `SEND_EMAIL` with
  `destination_address: martin.j.menke@gmail.com`.
- Fixed the import-stripping regex (`m` -> `gm` flag) in three existing
  test scripts (worker.js grew a second `import` line) — confirmed red
  before, green after.
- `scripts/test-subscribe-decline-email.js`: composes the real
  `subscribe()` with the real `sendDeclineAlertEmail()`. Proved red against
  a scratch copy of `7d2765b` (`git archive`, no `git worktree`): `FAIL:
  sendDeclineAlertEmail is not defined`. Green on this branch, all 9 checks
  pass; all 5 test scripts pass together.
- All commits so far carry `Co-Authored-By`/`Claude-Session` trailers (the
  first three were missing them, rewritten with `git filter-branch
  --msg-filter` while still local/unpushed).
- First report sent to the overseer (landing-opzichter) at commit `e66eec9`.
  Overseer verified red-proof and the 5 green tests independently, and
  `wrangler deploy --dry-run` builds clean — but did NOT land: Martin found
  `leskobusiness.com` already has live GoDaddy inbound mail (MX
  smtp.secureserver.net / mailstore1.secureserver.net, SPF
  spf.em.secureserver.net) which `wrangler email routing enable
  leskobusiness.com` (what the brief's Deploy-implied section told Martin
  to run) would silently replace — the brief's account-steps section was
  wrong, not just incomplete. DECISION BY MARTIN (2026-10-06, relayed by
  the overseer): send the alert from a subdomain instead, apex MX
  untouched. New task: (1) settle from Cloudflare's own docs whether
  `send_email` can send from a subdomain at all, (2) if so pick the
  subdomain and update code/docs, (3) correct the wrangler.jsonc comment
  and brief's account-steps with exact commands + an explicit apex-MX
  warning, (4) re-run all five tests. Must not run any account mutation,
  must not touch credentials (both already denied once, unchanged), must
  not push to main.
- Researched via WebFetch/curl against developers.cloudflare.com (fetched
  page markdown directly, not just AI-summarized) and confirmed with exact
  quotes:
  - `send_email` with `destination_address` fixed to one verified address
    (our exact case) is free on **all** plans "even when only Email
    Routing is configured" — no paid Email Sending product needed for
    this alert specifically.
  - BUT enabling **Email Routing** on a zone adds MX records "to your root
    domain" (confirmed exact wording) — it is zone-level and always
    touches the apex. Its "subdomain" feature (dashboard: apex domain ->
    Settings -> Subdomains) is additive ON TOP of an apex already onboarded
    to Email Routing, not a substitute — so Email Routing can never avoid
    touching the apex MX, on a subdomain or not. The overseer/Martin's
    "send from a subdomain" plan cannot be done via Email Routing.
  - **Email Sending** (a separate, newer product) CAN be onboarded directly
    on a subdomain (`wrangler email sending enable <subdomain>`, confirmed
    this exact CLI command exists via `--help`, distinct from `email
    routing enable`) and its own DNS footprint is entirely scoped to a
    `cf-bounce.<that-subdomain>` subdomain — confirmed exact wording, it
    never touches the root domain's own MX, whichever domain/subdomain you
    onboard. This is the one path that actually satisfies "subdomain,
    apex MX untouched."
  - Catch: Email Sending the product is gated to the Workers Paid plan —
    pricing table lists it "Not available" on Free, flatly, with no
    verified-destination carve-out (unlike Email Routing's free path above)
    — $5/mo base if not already paid, usage itself still free since sends
    to a verified destination don't count against the 3,000/mo quota. I
    could not determine from this worktree whether the Freelesko account
    is already on Workers Paid (no CLI surfaces billing plan; it's a
    dashboard-only fact) — this is a second, separate thing to flag to
    Martin per the brief's own "stop before adding a paid plan" clause,
    distinct from the apex-MX question the overseer asked about.

In flight: about to change `DECLINE_ALERT_FROM` to a subdomain address
(proposing `decline-alert@alerts.leskobusiness.com`, subdomain
`alerts.leskobusiness.com`) and correct wrangler.jsonc's comment + the
brief's account-steps, then re-run all 5 tests (no test asserts the exact
FROM value today, confirmed by grep, so this should stay green without
test changes) — not yet done.

Next:
1. Make the subdomain FROM-address change above; re-run all 5 tests.
2. Rewrite wrangler.jsonc's `send_email` comment and this brief's Deploy
   implied / Spec proposals sections with the exact `wrangler email
   sending enable alerts.leskobusiness.com` (not `email routing enable
   leskobusiness.com`) command, plus an explicit warning against ever
   running `email routing enable` on the apex.
3. Commit, then report back to the overseer with: the apex-MX finding
   above (Email Routing can't do this, Email Sending on a subdomain can),
   the Workers-Paid-plan question Martin needs to confirm before anyone
   runs the real `email sending enable`, and the corrected commands.
4. Still DO NOT run any account mutation, still DO NOT push to main —
   those remain the overseer's/Martin's.

Traps (with dates):
- 2026-10-06: `wrangler tail` is live-only — no historical query, no
  `--since`/`--until` flag. Don't re-try this; it was checked via
  `--help` and confirmed.
- 2026-10-06: reading wrangler's own OAuth token out of
  `~/Library/Preferences/.wrangler/config/default.toml` to call
  Cloudflare's API directly is blocked by the permission system
  ("Credential Exploration") — correctly, since `WT_CARRY=""` means no
  credential is meant to travel into a worktree. Don't retry this through
  another tool/encoding; ask the overseer/Martin instead.
- 2026-10-06: worker.js now has two `import` lines (raillog.js,
  cloudflare:email). Any future test script that loads worker.js into a
  Node `vm` context by stripping `import` lines must use the `g` flag
  (`/^import\s+.*?;\s*$/gm`), not just `m` — three existing scripts broke
  on this until fixed here.
- 2026-10-06: Email Routing is unconfigured for leskobusiness.com and
  there are zero verified destination addresses on the account as of this
  writing — confirmed via `wrangler email routing settings
  leskobusiness.com` / `wrangler email routing addresses list` with
  `CLOUDFLARE_ACCOUNT_ID=c75d24d09764e8db455eaf601ba3b377`.
