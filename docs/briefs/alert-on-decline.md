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

*(Replaced in full 2026-10-06 ~20:30 CEST. Re-derive from git + this
section after a compaction; do not trust a conversation summary.)*

**Branch state.** `alert-on-decline` at `3d69fa9` (merge of `origin/main`
@ `a55c994`). Working tree clean. **Reviewed by the overseer and NOT
landed** — Martin has never said "land it". The code is finished and
proven: `sendDeclineAlertEmail()` in `worker.js` (raw MIME, no new
library, `ctx.waitUntil`, no-op when `SEND_EMAIL` is unbound), the
`send_email` binding in `wrangler.jsonc` with `destination_address`
pinned to Martin's address, `scripts/test-subscribe-decline-email.js`
(9 checks, proved red against `7d2765b` first). All five test scripts
pass together; `wrangler deploy --dry-run` builds clean at 12.89 KiB.

**DECISION BY MARTIN 2026-10-06: option 3 — drop the email channel.**
Asked in the same breath whether a pub/sub could carry the alert instead;
answered (see below) but he has not chosen a replacement. Consequence:
this branch has nothing left worth landing — the `BTB_ALERT …
PAYMENT_DECLINED` line already exists and already fires on `main`, and
the `/gm` regex fix in three test scripts was only needed because the
email code added a second `import`. **Park the branch, do not delete.**

**On pub/sub (answered, not acted on).** Cloudflare has no free built-in
alert on a log string: Logpush is Paid, Queues is a Worker binding and
not a notifier. This org's alert kit is GCP (`raillog.py`,
`deploy-alerts.sh`, Cloud Alerting matching `BTB_ALERT` text at
`"severity": "ERROR"`). So the GCP route is: the Worker writes straight
to Cloud Logging `entries:write` — NOT Pub/Sub, which would still need
something draining the topic into logs. Cost: a Google service-account
key as a Cloudflare secret plus RS256 JWT signing in the Worker. Set
against $5/month for Workers Paid.

**Unresolved conflict about whether email is even paid.** This worktree
found (exact quotes from developers.cloudflare.com) that `send_email`
with a fixed `destination_address` is free on all plans "even when only
Email Routing is configured". The overseer found the Freelesko account
is on **Free — $0 — Current plan** and the dashboard table reads "Email
Sending — Free: —, Paid: Included". Both are first-hand. Not settled; a
real deploy is the only test. Do not state either as fact.

**GoDaddy / apex-MX question, 2026-10-06, still open but leaning.** All
of `leskobusiness.com`'s mail DNS is GoDaddy's stock parked-domain
default: MX smtp/mailstore1.secureserver.net, SPF `…secureserver.net
?all` (neutral), DMARC `rua=…@onsecureserver.net`, and **no**
`autodiscover`/`mail`/`email`/`pop`/`imap` records — the ones GoDaddy
adds when a mailbox is actually provisioned. Martin's GoDaddy account
holds no Email & Office product (GoDaddy upsells him one) and does not
even list `leskobusiness.com`. Nameservers are Cloudflare's, so the
records are editable in the Cloudflare zone and any change is
reversible. **Settling test, Martin's, not yet run:** mail
`nobody@leskobusiness.com` from Gmail; a bounce means the apex MX is
decorative and the free Email-Routing route is back on the table.

**Why European cards decline — answered 2026-10-06 ~21:30 CEST from
BigQuery, and the previous two answers in this file were both wrong.**
Source: `lesko-486515.provisioning_models.stg_authnet_unsettled` and
`…stg_recurly_transactions` (read-only `bq query`, no credentials read).

**Read this first — the table trap.** `provisioning_models.stg_authnet`
is built only from Authorize.Net `failed_payment_notification` webhooks,
so it is **decline-only by construction**: 23,612 declines, 160
generalErrors, zero approvals, ever. Computing an approval rate from it
produces "nothing ever succeeds", which is false. Approvals live in
**`stg_authnet_unsettled`** (the API pull) and in
**`stg_recurly_transactions`**. The earlier claim in the memory bank that
this account has "11,101 declines and 3 successes" comes from the
decline-only table and should not be trusted.

**What the data actually shows.**
- *The account is healthy.* 126 approvals on 2026-10-06; the daily
  approval rate has sat between 19% and 53% every day since 2026-09-15
  with no collapse. The low absolute rate is a dunning-heavy book, not a
  fault.
- *Europe is approvable on this Authorize.Net gateway.* Belgium has **9
  approvals out of 28 attempts**, including **$29.95 and $89.95 both
  captured on 2026-09-29 16:46 and 16:49 UTC**. Approvals also exist from
  GE, FM, AU, LV, NZ and UM. Explanation **(B) "the merchant account
  refuses international cards" is dead**, and so is the earlier claim
  that no European card has ever been approved here.
- *The branded `/checkout` has NOT yet taken a payment.* Corrected
  ~22:00 CEST; the bullet that stood here claimed the opposite and was
  wrong. Recurly origin `token_api` is **not** our checkout — it goes back
  to 2026-08-09, months before `/checkout` existed, so it is the
  ClickFunnels pages with Recurly.js embedded. The reliable signature is
  the **account code**: `worker.js:118` sets `account.code = email`, so a
  sale through our page carries an email-shaped account code. Since
  go-live (2026-09-30 13:20 UTC) there are **zero** email-shaped account
  codes on any transaction, any status. Of 4,961 account codes seen since
  2026-09-24, 4,776 are hex/UUID (Recurly-generated), 183 other, and
  exactly **2** are email-shaped — both on 2026-09-29, both origin `hpp`,
  i.e. Giulia's hosted-page test. **Coverage caveat:**
  `stg_recurly_transactions` was last fetched **2026-10-06 03:30 UTC**, so
  anything after 03:24 today is outside this test, including today's three
  captures and every Belgian attempt.
- *Business plans do sell, through the older routes.* `stg_authnet_unsettled`
  shows "Lesko Business" charges captured most days since 2026-09-24 —
  about 23 approvals in all, 3 of them on 2026-10-06 (invoices 291121,
  291171/291172, 291182, all US). The plans started selling before
  `/checkout` existed, so ClickFunnels and the hosted pages are carrying
  them.
- *Currency is ruled out conclusively.* All **46,626** Recurly
  transactions on this account, for all time, are **USD**. Not one has
  ever been presented in any other currency.

**So why did Martin's and Giulia's cards fail on 2026-10-06?** It is
card-specific, and the Merchant Advice Code says so per card:
- **Martin's Mastercard: MAC `01` "New account information" on every one
  of six attempts** (14:17 ×2, 14:18 ×2, 15:21, 15:56 UTC). Mastercard's
  MAC 01 means the issuer holds newer account details than the card
  presented — the card has been reissued or updated. The same card was
  approved on 2026-09-06 and 2026-09-01. Action: use the current card.
- **Giulia's Visa: MAC `2` "Issuer cannot approve at this time"** (14:39,
  15:38, 15:40 UTC) — a soft, temporary refusal. The same Visa was
  approved for $29.95 and $89.95 on 2026-09-29. Four attempts inside an
  hour on a card that already holds those subscriptions is the classic
  shape of an issuer velocity/duplicate block. Her Mastercard got MAC 01
  at 15:42, same story as Martin's.
- CVV came back `M` (match) on most of these, so CVV is a real signal on
  this account even though AVS is not.

**3DS remains a genuine gap but is not the blocker.** Authorize.Net
cannot do 3DS ("Gateway-specific 3DS2 supported — No"), Recurly has never
returned a `three_d_secure_action_token_id`, and the SCA branch in
`checkout.html` and `worker.js` has still never run. A 3DS-capable
gateway is worth having for rates and for issuers that do demand SCA — it
is not what stopped these two cards, and the Recurly Payments
application should be chased on its own merits, not as a Europe fix.

**Do not cite AVS as evidence.** `avs_response='P'` on every transaction
sampled — declines and approvals alike. AVS is never evaluated on this
account.

**Loose end.** `docs/specs/modules/worker.md:124` records the decline at
"18:52 CEST" (16:52 UTC). No transaction exists in either table in the
16:00–18:10 UTC window on 2026-10-06; the latest Belgian attempt is 15:56
UTC (17:56 CEST). The spec's timestamp is unexplained — do not build on
it. That correction is the overseer's to make; a worktree may not edit
`docs/specs/`.

**For the lesko-checkout overseer:** purchases through the branded
checkout carry Recurly origin **`token_api`**, not `api` and not `hpp`.

**Traps (keep, they are short).**
- 2026-10-06: never `wrangler email routing enable leskobusiness.com` —
  zone-level, replaces the apex MX. See repo CLAUDE.md.
- 2026-10-06: Email Routing's dashboard "subdomain" feature is additive
  on an apex already onboarded, never a substitute. Only **Email
  Sending** (`wrangler email sending enable <subdomain>`) onboards a
  subdomain alone; its DNS stays under `cf-bounce.<subdomain>`.
- 2026-10-06: `wrangler email sending list`/`settings` return
  `Unauthorized [code: 2036]` — this machine's OAuth token has no Email
  Sending scope. The CLI cannot inspect that side at all.
- 2026-10-06: `scripts/test-raillog-alert.js` takes **`raillog.js`** as
  its only argument. Passing `worker.js` fails misleadingly with "Cannot
  use import statement outside a module".
- 2026-10-06: Recurly captures the buyer's IP at tokenisation; never
  send `ip_address` beside `token_id` (422, broke production 16:17–16:47
  UTC).
- Standing: no credential reads (keychain, OAuth token) — denied. No
  real card test — Martin's. Never push to `main` from a worktree.

**Next, all Martin's and all off this branch.** (1) Clear the Recurly
past-due balance — it is a live production risk and likely what holds
the gateway application. (2) Chase the Recurly Payments application.
(3) The US-issued card test is no longer needed — US cards already
approve daily through `token_api`. Martin: try a current card, and
tell Giulia to wait a day and attempt once. (4) Decide park-or-revive.
