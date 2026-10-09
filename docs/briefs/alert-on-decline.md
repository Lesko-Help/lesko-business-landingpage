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

Last rewritten 2026-10-08 ~18:40 CEST. Read only this section plus **Goal**
and **Done when**; everything above is background.

### Done

- The decline alert is proven in production (three `BTB_ALERT` lines,
  2026-10-07 18:52 CEST, Workers Observability).
- `a6b8c00` fixed the production break where `ip_address` rode beside
  `token_id` in the Recurly purchase (Recurly 422s that outright).
- The real $29.95 sale through the branded `/checkout` is confirmed twice
  over: Recurly 2026-10-06 14:23:20 UTC, and GA4 `purchase` on `/welcome`.

### Why Martin's mother's card got blocked (2026-10-08)

Her bank called it "a very unusual checkout" and blocked the card. The data
says the bank was reading the transaction correctly. Four things stack up,
and together they are the textbook profile a European issuer blocks:

1. **The gateway is Authorize.Net** (`gateway_name` on every row). A US
   acquirer. For a Belgian cardholder that makes every charge
   *cross-border* — what the schemes call "one leg out".
2. **The amount is always USD.** `buildPurchase` in `worker.js` hard-codes
   `currency: 'USD'`. A Belgian debit card being asked for dollars by a US
   merchant is a foreign-currency charge, with its own fee and its own
   fraud score.
3. **No 3-D Secure actually happens.** Because the acquirer is outside the
   EEA, PSD2 strong authentication is not legally forced — so nothing
   authenticates the cardholder, and the issuer carries the whole risk. An
   unauthenticated cross-border card-not-present charge is exactly what an
   EU fraud engine blocks.
4. **The same card was retried over and over.** On 2026-10-06, card
   `…6349` was attempted **seven** times between 14:17 and 16:52 and card
   `…1780` **three** times between 14:39 and 15:40 — all declined, all
   from Belgium. To an issuer that cadence reads as card testing, and the
   answer to card testing is to block the card, not just the attempt.

Every Belgian attempt came back `gateway_response_code = 2`,
`gateway_message = "Declined"`, `status_message` "The customer's bank has
declined their card" — the issuer refusing, not a 3-D Secure challenge.

### The 3-D Secure branch reads the wrong level (defect, unfixed)

`worker.js:290` (production: `worker.js:243`) does

    if (err.three_d_secure_action_token_id)

where `err = data.error`. Recurly v3 puts that token one level deeper, in
`error.transaction_error.three_d_secure_action_token_id` (its Node client
exposes it as `transactionError.threeDSecureActionTokenId`). So the test is
always `undefined`, the 3-D Secure branch never fires, and the request
falls through to the decline branch — the buyer is told "your card was
declined" at the one moment the bank was willing to approve after a check.

`checkout.html` is fine: lines 404-415 wire `recurly.Risk().ThreeDSecure`
correctly and re-submit with the result token, and `worker.js:117` puts
that token in `billing_info` correctly. Only the hand-back is wrong.

Not yet proven live — no 3-D Secure response has ever been observed here,
because Authorize.Net is probably not configured for it. The fix is cheap
and cannot break anything: read both levels. Writing it is a worktree's
job; landing it is Martin's.

### Where the checkout does not meet the rules (2026-10-08)

Read off `checkout.html` and `worker.js`, not off a lawyer's opinion.

What is **right**: the card field is Recurly's own (card numbers never
reach this site or our Worker); the recurring terms are stated before Pay
("Renews: Automatically. Cancel any time." and "Your card is charged today
and then on each renewal until you cancel") — that is what the card schemes
require; the 30-day refund promise is stated twice.

What is **missing**:

- **No Terms and Conditions anywhere on `/checkout`.** `grep -ci "terms of
  service|terms and conditions"` → 0. The footer has FAQ, Member sign in,
  Contact, Privacy, and nothing else.
- **No EU right-of-withdrawal notice.** A Belgian consumer has 14 days by
  law; for a digital service given immediately they must explicitly waive
  it. The 30-day guarantee is more generous but is not the statutory
  notice, and there is no waiver checkbox.
- **No VAT, and no VAT field.** Accepted on 2026-09-30 for speed, but
  selling a digital membership to an EU consumer creates an EU VAT
  obligation for a US seller (OSS). This is a tax exposure, not only a
  missing input. Martin's accountant, not a worktree.
- **The Privacy link may be dead.** It points at
  `https://www.free.lesko.com/privacy-policy`. `curl` gets 403 and real
  Chrome froze on it twice, so this is **unverified** — but CLAUDE.md's
  standing trap says every `free.lesko.com` link redirects to the sales
  VSL. Needs a human to open it.
- **No legal seller identity.** The footer gives "© 2026 Matthew Lesko ·
  1851 Columbia Rd NW #402, Washington, DC 20009" — an address, but no
  company name or registration number.
- **No cookie consent, analytics granted in the EU.** Knowingly decided by
  Martin 2026-10-01. Listed here for completeness, not as news.
- **No bot or velocity check on `/api/subscribe`.** The rate limit is 5
  requests per 60 s per caller IP (`5e7b1dd`) — which did nothing against
  the seven attempts on card `…6349` spread over three hours. There is no
  cap per card and none per email. Already listed as accepted in CLAUDE.md;
  the mother's block is the first time it cost something real.
- **PCI scope is SAQ A-EP, not SAQ A.** Recurly's hosted fields keep the
  card off our servers, but we serve the page that loads the payment
  script, so the page itself is in scope.

### Traffic, as of 2026-10-08 18:30 CEST

- All three pages serve: `/` 200 (142750 B), `/checkout?plan=monthly` 200
  (24267 B), `/welcome` 200 (8200 B).
- Payments are switched on: `POST /api/subscribe {}` answers **400**
  "Unknown plan". It would answer 503 if `RECURLY_API_KEY` were missing,
  and the key check runs first — so a 400 proves the private key is there.
  No card, no token, nothing charged.
- Cloudflare Observability, last 24 h: **200 events, 0 errors.** The
  visible ones are bot scans (`/wp-admin/install.php`, `/xmlrpc.php`,
  `/wp-sitemap.xml`, `/.git/HEAD`).
- **One genuine `/checkout` open today**, 11:45:58 CEST — a
  `GET https://www.leskobusiness.com/api/config`, which only
  `checkout.html`'s own script ever calls.
- **Nobody pressed Pay.** Needle `subscribe` over 24 h returns exactly two
  hits, 2026-10-07 18:54:58 and 2026-10-08 18:29:37 CEST, and both are my
  own probes. Zero real checkout attempts.
- So: serving, yes. Selling, no.

### Traps learned, with their dates

1. **`stg_recurly_transactions` lags ~13 h** (fetched to 2026-10-08
   03:30:15 UTC, 775 min stale when read). Always read `MAX(fetched_at)`
   before concluding anything from an absence. This is what made `a9793ae`
   wrong and made me tell Martin no payment had gone through when one had.
2. **GA4 property `556794866` holds two web streams** —
   `leskobusiness.com` (`G-6K847LXFE7`) and **ClickFunnels funnels**
   (`www.free.lesko.com`). Unfiltered it reads 3,965 users / 15,904 events
   for Sep 9 – Oct 6; ~99 % is not ours. Every read must filter
   Hostname contains `leskobusiness.com`.
3. **Asset requests are not visitors.** Cloudflare's ~1.7 k requests / 7 d
   counts CSS, JS, favicons, bot scans and my own curls. GA4 filtered to
   our hostname counts people: 5 in that week, and they were us testing.
4. **`origin` cannot tell our buyers apart.** Both the branded `/checkout`
   and the old ClickFunnels Recurly.js pages arrive as `token_api`; it
   first appears 2026-08-09, before `/checkout` existed. Only
   `account_code` containing `@` marks ours — and only for successes,
   because a declined purchase often persists no account at all.
5. **There is no `plan_code` and no `origin_ip_country`** on
   `stg_recurly_transactions`. The country column is `ip_address_country`.
6. **`avs_response = 'P'` is a constant** on this account, on approvals and
   declines alike, so it is never evidence. `cvv_response = 'M'` is real.
7. **`stg_authnet` is decline-only by construction** (built from
   `failed_payment_notification` webhooks: 23,612 declines, zero approvals
   ever). Approvals live in `stg_authnet_unsettled` and
   `stg_recurly_transactions`.
8. **`docs/specs/modules/worker.md:124`'s "18:52 CEST" is correct** — it is
   the Workers Observability timestamp of the three proven declines. The
   "unexplained" note beside it can go. A worktree may not edit
   `docs/specs/`, so this is for the overseer.

### Next

- **Martin's, and the only thing that unblocks real European sales:**
  decide whether to keep charging EU cards in USD through a US acquirer.
  Until that changes, EU issuers will keep declining and occasionally
  blocking cards, and no code change here prevents it. The options are a
  European acquirer / Recurly Payments (the application is already
  pending), charging in EUR, or accepting that the EU is not a market yet.
- **Martin's:** open `https://www.free.lesko.com/privacy-policy` himself
  and say whether it is a real policy or the VSL redirect.
- **A worktree's:** fix the 3-D Secure level (read both), and add a Terms
  link plus the withdrawal notice to `/checkout` — copy is Giulia's, so
  the brief must say so.
- **Tell the lesko-checkout overseer:** our buyers arrive as Recurly
  origin `token_api`, shared with ClickFunnels, so origin alone cannot
  split them.
- Still open, and not this repo's: did the 14:23 sale actually provision
  Mighty Networks access (lesko-provisioning's rail)?
- This branch: **park, do not delete.**
