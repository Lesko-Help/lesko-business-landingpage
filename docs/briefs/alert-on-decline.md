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
account-level, outside "worktree writes code, overseer deploys"), in this
order:

1. `wrangler email sending enable alerts.leskobusiness.com` — onboards the
   subdomain the FROM address (`decline-alert@alerts.leskobusiness.com`)
   lives on to Cloudflare's Email Sending product. Its DNS additions are
   confined to `cf-bounce.alerts.leskobusiness.com`; it never touches
   `leskobusiness.com`'s own MX record. Gated to the Workers Paid plan —
   confirm the account is already on it before running this (open
   question, see State).
2. `wrangler email routing addresses create martin.j.menke@gmail.com` then
   clicking the verification link Cloudflare mails to that address
   (Martin's own action) — account-scoped, no DNS change, shared by both
   Email Routing and Email Sending.

**Never run `wrangler email routing enable leskobusiness.com` (or any
`email routing enable` on the bare apex).** `leskobusiness.com` already
has live inbound mail through GoDaddy (MX `smtp.secureserver.net`); Email
Routing's enable step is zone-level and would silently replace those MX
records, breaking that mail. This was the original version of this
section's mistake, caught by Martin before landing — see State for the
full finding.

Until both of the two steps above are done, `sendDeclineAlertEmail()` is a
documented no-op (`if (!env.SEND_EMAIL) return;`) — a decline still logs
its BTB_ALERT line exactly as before, nothing regresses.

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
  with a fixed `destination_address`, and its FROM address lives on
  `alerts.leskobusiness.com` (Email Sending, onboarded per-subdomain),
  never on the bare apex — `leskobusiness.com` already has live GoDaddy
  inbound mail, and Email Routing (the other Cloudflare product, the one
  that would also satisfy the binding's "onboarded to Email Service"
  requirement) is zone-level and would replace that apex MX outright.
  Both the subdomain's Email Sending onboarding and the destination
  address's verification are intentionally left for the overseer/Martin,
  not run from this worktree.

## State

Last rewritten 2026-10-07 ~19:00 CEST. Read this section, Goal and Done when;
the rest of the brief is background.

**Done**

- The decline alert is **proven in production**. Cloudflare Observability,
  2026-10-06, three `error`-level lines at 18:52:14.502 / 18:52:33.747 /
  18:52:51.379 CEST, each `BTB_ALERT lesko-business-landingpage/api-subscribe
  PAYMENT_DECLINED: plan=business-monthly code=declined gatew…`. No card data,
  no email, no buyer-facing text. They match three real Recurly declines at
  16:52:13 / 16:52:32 / 16:52:50 UTC to the second.
- The production break is fixed (`a6b8c00`): `buildPurchase` may never send
  `ip_address` beside `token_id`. Last occurrence of that error 2026-10-06
  18:27:00.287 CEST.
- The European-decline question is **closed**: the gateway is not refusing
  euros. Giulia's Mastercard came back with Merchant Advice Code `01`, "new
  account information" — the card was reissued and the issuer holds newer
  details. `cvv_response = 'M'` means the CVV matched.
- **The branded `/checkout` has taken a real payment.** 2026-10-06 14:23:20
  UTC, origin `token_api`, success, **$29.95 `business-monthly`**, subscription
  `zq2baa3yi8z5`, account_code/email `freelesko@gmail.com`, Visa ...4337,
  gateway Authorize.Net, message "Approved". Two independent counts agree:
  Cloudflare logged **16 subrequests to `v3.recurly.com` in 7 days, 15×4xx +
  1×2xx**, and `worker.js:270` is the only line that calls that host;
  BigQuery shows exactly 15 `token_api` declines and 1 `token_api` success in
  that window at business-plan prices.
- The GA4 tail of that sale is proven: `/welcome` shows `purchase` ×1,
  $29.95.

**Traffic, as of 2026-10-07 18:56 CEST**

- The site **is** serving: `/`, `/checkout?plan=monthly`, `/welcome`,
  `assets/site-events.js` and `/api/config` all 200. `/api/config` hands out
  the public key. 80 Worker events today, **0 errors**.
- Payments **are** switched on: `/api/subscribe` with an empty body answers
  400 "Unknown plan", and the `RECURLY_API_KEY` check at `worker.js:248` runs
  *before* the plan check at `worker.js:261` — so a 400 instead of a 503
  proves the secret is present.
- **No human traffic.** GA4 filtered to our hostname: Sep 9 – Oct 6 is 30
  views and **5 active users** (`/` 15/5, `/checkout` 14/4, `/welcome` 1/1);
  2026-10-07 is **0**. Those five were us testing.
- **No checkout attempts today.** Exactly one `/api/subscribe` in today's
  Worker logs, 18:54:58 CEST, and that was this session's health probe.
- What Cloudflare's 1.7k/7d asset requests actually are: CSS, JS, favicons,
  our own curl checks, and bots probing `/wp-admin/install.php`,
  `/api/session/properties` and `/.git/HEAD`. Checked 2026-10-07: `.git/`,
  `CLAUDE.md`, `docs/`, `worker.js`, `wrangler.jsonc`, `.werk.conf` and
  `.dev.vars` all 404 on the live site. `.assetsignore` is holding.

**Traps learned, with their dates**

- *GA4 property `556794866` holds two web streams* (2026-10-07):
  `leskobusiness.com` (`15890761111`, `G-6K847LXFE7`) and `ClickFunnels
  funnels`/www.free.lesko.com (`15959542547`). Unfiltered it reads 3,965
  users — 99% ClickFunnels. Always filter *Hostname contains
  leskobusiness.com* first.
- *`origin = token_api` does NOT identify our checkout* (2026-10-07). The
  ClickFunnels Recurly.js pages arrive as `token_api` too; it first appears
  2026-08-09, before `/checkout` shipped.
- *`account_code == email` finds our successes, not our declines*
  (2026-10-07). `worker.js:118` sets `account.code = email`, but a declined
  purchase often persists no account, so the code comes back empty.
- *`stg_recurly_transactions` lags by hours* (2026-10-07). It was 13.4h stale
  at 16:55 UTC today (fetched to 03:30). Reading an absence from it is what
  made `a9793ae` wrong. Always read `MAX(fetched_at)` first.
- *`stg_authnet` is decline-only by construction* (2026-10-06): built from
  `failed_payment_notification` webhooks only, 23,612 declines, zero
  approvals ever. Approvals live in `stg_authnet_unsettled` and
  `stg_recurly_transactions`.
- *`avs_response = 'P'` is a constant on this account* (2026-10-06) — on
  declines and approvals alike, so never evidence. `cvv_response` is real.
- *Workers Observability only began logging 2026-10-06 ~18:27 CEST.*

**Next**

- Tell the **lesko-checkout** overseer: our buyers arrive as Recurly origin
  `token_api`, shared with ClickFunnels, so origin alone cannot split them;
  `account_code` containing `@` is the only clean split, and only for
  successes.
- Tell the **overseer** that `docs/specs/modules/worker.md:124`'s "18:52
  CEST" is confirmed correct; the "unexplained" note can go.
- Open: whether the 14:23 sale provisioned MN access (lesko-provisioning's
  rail, not this repo's).
- The checkout works and sells. The missing thing is visitors, which is not
  this branch's job.
- Branch recommendation unchanged: **park, do not delete.**
