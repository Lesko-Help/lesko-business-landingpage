# worker
Status: as-built 2026-10-09 (decline email `f34be49`)
Kind: helper
Summary: `worker.js` (+ `raillog.js`): the checkout's `/api/config` and `/api/subscribe` (Recurly purchase), plus the unused `/api/videos` feed
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-10-09
Reads: the Recurly v3 API (`POST /purchases`, API version v2021-02-25); YouTube's public RSS feed for Matthew's channel (`UCwKJZfa7sWV_qKxQnLBUpjA`, `/api/videos` only).
Writes: a Recurly account + subscription per successful purchase; per card decline one `BTB_ALERT` line to Workers Logs (see `alert()`) **and** one email to Martin (see `sendDeclineAlertEmail()`); nothing else of its own (no table, no storage besides Cloudflare's cache for `/api/videos`).

## Overview

*What it is for:* take a Recurly.js card token from `/checkout` and turn it into a purchase on a business plan.
*What it owns:* `worker.js` and `raillog.js`; `main`, the `SUBSCRIBE_LIMIT` rate-limit binding, the `SEND_EMAIL` binding and the `observability` block in `wrangler.jsonc`.
*What it depends on:* the three Recurly plans in `PLAN_CODES`; the Workers Rate Limiting binding; YouTube's feed (videos only).
*Public entry points:* `fetch(request, env, ctx)` with routes `/api/subscribe`, `/api/config`, `/api/videos`.
*Not in scope:* the checkout page's fields and look (`page`); provisioning after payment (lesko-provisioning).
*Secrets:* Worker secrets `RECURLY_API_KEY` (private, full scope) and `RECURLY_PUBLIC_KEY`; a copy lives in Martin's Mac keychain (service `leskobusiness`).
*Personal data:* the buyer's email, names, optional company go to Recurly; the email becomes the Recurly account code; none of it is logged or stored here.

Used by: `checkout.html` (`/api/config`, `/api/subscribe`). `/api/videos`: nobody since 2026-09-29 *(as-built, not intended: the route still runs)*.

## Functions

### subscribe(request, env) — the `/api/subscribe` route

*Signature:* `async function subscribe(request, env)`, called from `fetch` for path `/api/subscribe`.

*What it does:*
- S1: reads the caller's IP once (`callerIp()`, the `CF-Connecting-IP` header Cloudflare sets from the TCP connection, so a caller cannot forge it) and passes it to both the limiter and the purchase — it is never read from the header twice. Then rate-limits, before the method, the key or the body — `withinSubscribeLimit(ip, env)`, 5 calls per 60 s (`SUBSCRIBE_LIMIT`), keyed on `'unknown'` when the header is absent. Over it: 429 `{ok:false, error:'rate-limited', message:'Too many attempts…'}`. Live enforcement is per Cloudflare location and eventually consistent: on 2026-09-30 the first 429 came at about call 21, not 6.
- S2: anything but POST -> 405; no `RECURLY_API_KEY` -> 503 "Payments are not switched on yet".
- S3: validates `plan` (a key of `PLAN_CODES`), `token`, `email`, `first_name`, `last_name`; a miss -> 400 with a buyer-readable `message`.
- S4: builds the payload with `buildPurchase()` — currency USD, account code = email, the card token, optional `three_d_secure_action_result_token_id` (and no other `billing_info` field — see B2) — POSTs it to `/purchases` and maps Recurly's answer: success -> 201 `{ok:true, plan_code, account_code}`; 3-D Secure wanted -> 402 with `three_d_secure_action_token_id`; declined -> 402 with `declineMessage(te)`; validation -> 400 ("already has an active membership" when Recurly says "already"); Recurly unreachable or anything else -> 502.
- S5: a decline does three things — the buyer's own 402 (S4), one alert line through `logDecline(plan, te)` — `BTB_ALERT lesko-business-landingpage/api-subscribe PAYMENT_DECLINED: plan=… code=… gateway_error_code=…` — carrying those three values and nothing else: never `te.message`, never the buyer-facing sentence, never the email or card. A validation error or other failure still prints a plain `console.log` with Recurly's own error text. The worker never logs the email or card data itself *(as-built: Recurly's validation text could quote a field value; unchecked)*. Third, one email to Martin through `sendDeclineAlertEmail(env, plan, te)`, handed to `ctx.waitUntil` so a slow or failing send never delays or breaks the buyer's 402 — the `BTB_ALERT` line is written first and stands whether or not the email goes out.

*Examples:* `POST {}` -> `400 {"ok":false,"message":"Unknown plan. …"}`; the 6th rapid POST from one IP in `wrangler dev` -> 429.

*Inputs:* JSON body `plan`, `token`, `email`, `first_name`, `last_name`, optional `company`, `three_d_secure_action_result_token_id`; header `CF-Connecting-IP` (the rate-limit key, and nothing else — it is never sent to Recurly, see B2); secret `RECURLY_API_KEY`.

*Outputs:* JSON with status 201/400/402/405/429/502/503, always with a `message` safe to show the buyer (except 201).

*Errors:* 400, 429, 502, 503 are shown to the buyer and not alerted — a person is at the page. A **decline (402) is both**: the buyer sees `declineMessage(te)` and one `BTB_ALERT … PAYMENT_DECLINED` line is written, because a decline is the one failure nobody can see afterwards otherwise *(closed 2026-10-09, `f34be49`: the line is both retained and mailed. Retention was confirmed on 2026-10-07 — the three `BTB_ALERT … PAYMENT_DECLINED` lines from the 2026-10-06 declines were still readable in Workers Observability. Mailing is `sendDeclineAlertEmail()`, which stands in for the GCP log-based alert policy the global rule describes: there is no Cloudflare equivalent, so the Worker mails Martin itself. Still pending, and Martin's: the two one-time Cloudflare steps in `wrangler.jsonc`'s comment, without which no email can leave.)*.

*Test:* `scripts/test-subscribe-rate-limit.sh <dir> expect-429` — six rapid POSTs against local `wrangler dev` without a key: five 503, the 6th 429 (S1); red first against `origin/main` (`expect-no-429`). **Two reasons this test now lies, both found 2026-10-09/12 and neither a defect in `worker.js`:** it hard-codes `PORT=8799`, and its `cleanup()` `pkill`s then `kill -9`s whatever holds that port — so running it while another worktree's session has a `wrangler dev` up kills that session's server and fails this test with another session's answers; and since `f34be49` added the `SEND_EMAIL` binding, the run returns **six 501s instead of five 503s and a 429** — suspected `send_email` being unimplemented in local `wrangler dev`, which would make this a local-testability regression on `main` rather than a branch bug. Unverified: nobody has yet run `wrangler dev` on `f34be49` with the binding removed to confirm it. Until then the test proves nothing either way, and a branch is not judged on it. Fixing it (a free port per run, and a local-dev path for the mail binding) is its own task.
`node scripts/test-subscribe-build-purchase.js worker.js` — 6 checks on S4's payload: `ip_address` is absent whether or not an IP was given, and stays absent with a 3DS token and with a company, while `token_id` and `plan_code` are still set. It asserts **Recurly's rule**, not the shape we happen to build — the earlier version asserted only the latter, which is why it stayed green while production was broken. Red first against `9f77d5d` (3 of the 6 fail, each printing a payload with `ip_address` in it).
`node scripts/test-subscribe-decline-alert.js worker.js raillog.js` — S5, composing the real `logDecline()` with the real `alert()` (no stubs): the captured line starts with the `BTB_ALERT` prefix, carries both ids, and contains neither `te.message` nor any email; red first against `origin/main`.
S3 and the live S4 call stay unproven end to end until the first real purchase.

### The wallet branch *(draft, not built)*

`/api/subscribe` is specified to take a PayPal, Apple Pay or Google Pay token
on the same route, with one extra `wallet` field and the two names made
optional. It lives in `docs/specs/modules/wallets.md` (W1-W4), not here,
until it is built. B2 holds unchanged for a wallet token.

### buildPurchase(ip, plan, token, email, first, last, company, tds)

*Signature:* `function buildPurchase(ip, plan, token, email, first, last, company, tds)` — called from `subscribe()` once the body has passed S3.

*What it does:*
- B1: returns the exact object POSTed to Recurly's `/purchases`: `currency: 'USD'`, the account (code = email, email, first and last name), and one subscription on the mapped `plan_code`.
- B2: **never sets `billing_info.ip_address`, or any other sibling of `token_id`.** A Recurly.js token already carries its own billing info, so Recurly's v3 `/purchases` rejects the pair outright: 422 "ip_address cannot be present with token_id". `subscribe()` still reads the caller's IP for the rate limit (S1) and still passes it in, but `buildPurchase` deliberately does nothing with it. *(2026-10-06: `265f225` added that line on the mistaken belief Recurly needed the IP passed separately, and it broke every live purchase for about half an hour until `a6b8c00` removed it. Recurly captures the buyer's IP itself during tokenisation and shows it on the transaction, so there was never anything for us to add — see Decisions.)*
- B3: adds `company` only when the buyer typed one, and `three_d_secure_action_result_token_id` only on the second attempt after a bank check.

*Examples:* `buildPurchase('81.82.1.1', 'monthly', 'tok', …)` and the same call with `''` both -> `…account.billing_info = {token_id:'tok'}`. The IP argument changes nothing in the payload.

*Inputs:* the caller's IP from `callerIp()` plus the validated form fields. *Outputs:* one plain object; it sends nothing itself.

*Errors:* none; it cannot fail.

*Test:* `node scripts/test-subscribe-build-purchase.js worker.js` (see `subscribe`).

### alert(runnable, code, what) — `raillog.js`

*Signature:* `export function alert(runnable, code, what)`, imported by `worker.js`. One function in its own file, ported from lesko-provisioning's `worker/raillog.py` (the alert half only — this Worker has no BigQuery table to write).

*What it does:*
- A1: prints `console.error(JSON.stringify({severity:'ERROR', message:'BTB_ALERT lesko-business-landingpage/<runnable> <CODE>: <what>'}))` — the one line a log-based alert matches on.
- A2: throws when `code` is not in `ALERT_CODES`, so a typo fails loudly in testing instead of quietly printing a line no alert policy will ever match.
- A3: `ALERT_CODES` is the global CLAUDE.md's seven (`AUTH_FAILED`, `SOURCE_FAILED`, `SOURCE_EMPTY`, `ASSERTION_FAILED`, `QUOTA`, `STALE`, `UNEXPECTED`) plus this repo's own `PAYMENT_DECLINED`.

*Inputs:* three strings. *Outputs:* nothing; it prints. *Errors:* throws on an unknown code (A2).

*Test:* `node scripts/test-raillog-alert.js raillog.js` — the line's exact shape, that every one of the eight codes is accepted, and that an unknown code throws; red first against `origin/main` (the file does not exist there).

*Why `console.error`, not `console.log`:* Cloudflare has no GCP-style promotion of a `"severity":"ERROR"` JSON field, so the key is kept only for text parity with the other repos; Workers Logs' level filter reads the `console` method. Workers Logs also had to be switched on for any of it to be retained — hence the `observability` block in `wrangler.jsonc`, with `head_sampling_rate: 1` written out so an alert line is never sampled away.

### sendDeclineAlertEmail(env, plan, te)

*Signature:* `async function sendDeclineAlertEmail(env, plan, te)` — called from `subscribe()`'s decline branch through `ctx.waitUntil`, never awaited inline.

*What it does:*
- E1: builds the raw MIME message by hand — `From`, `To`, `Subject: BTB-ALERT lesko-business-landingpage`, `Content-Type: text/plain; charset=utf-8`, `MIME-Version: 1.0`, then the body — and sends it with `new EmailMessage(from, to, raw)` through `env.SEND_EMAIL.send()`. By hand because this repo has no `package.json`: there is nothing here to `npm install`, so mimetext and nodemailer are both out.
- E2: the body is the same three values the log line carries and nothing more: `plan=… code=… gateway_error_code=…`. Never `te.message`, never the buyer-facing sentence, never the email or card — the same rule as `logDecline()` (S5), for the same reason: this message leaves the building.
- E3: no `SEND_EMAIL` binding -> returns at once, having sent nothing. That is the state the Worker is in until Martin runs the two one-time Cloudflare steps, so the no-op is the normal path today, not an error path.
- E4: both addresses are constants in `worker.js`: `DECLINE_ALERT_FROM = 'decline-alert@alerts.leskobusiness.com'` and `DECLINE_ALERT_TO = 'martin.j.menke@gmail.com'`. The FROM is on the **subdomain**, never the apex — see Decisions.

*Examples:* a `generic_decline` on the monthly plan -> an email bodied `plan=monthly code=declined gateway_error_code=2`.

*Inputs:* `env` (for the binding), the plan key, Recurly's `transaction_error`. *Outputs:* nothing; it sends. *Errors:* a throw from `send()` is caught at the call site and printed as a plain `console.log`, so a broken mail path can never turn a decline into a 500.

*Test:* `node scripts/test-subscribe-decline-email.js worker.js` — E1-E4 against a stub binding: the subject line, the three body values, that nothing else from `te` appears, and that an unset binding sends nothing; red first against `origin/main` (the function does not exist there). Not yet proven live, because no email can leave until the two Cloudflare steps are done.

### declineMessage(te)

*Signature:* `function declineMessage(te)` — `te` is Recurly's `transaction_error` (`code`, `category`, `message`, `merchant_advice`, `gateway_error_code`, any missing).

*What it does:*
- D1: a `code` in `DECLINE_MESSAGES` (about 30 codes in 9 groups: insufficient funds, expired card, CVV, address/ZIP, card number, card type, call your bank, gateway down, duplicate) returns that group's sentence.
- D2: an unlisted `fraud_*` code returns only the fixed `FRAUD_FALLBACK` ("check your billing address and ZIP, or try a different card") — never which fraud rule fired.
- D3: any other code returns Recurly's `message`; no code and no message returns "Your card was declined. Please try another card or contact your bank."

*Examples:* `{code:'insufficient_funds'}` -> "Your card was declined for insufficient funds. …"; `{code:'fraud_velocity', message:'…automated'}` -> the fraud fallback.

*Inputs:* the `transaction_error` object. *Outputs:* one string.

*Errors:* none; it always returns a string.

*Test:* `node scripts/test-decline-reasons.js worker.js` — 12 sample objects, prints PASS/FAIL, exit 0 on all pass (D1–D3); red first against `origin/main` ("declineMessage is not defined"). Loads `worker.js` by cutting it at `export default` and running the rest in a `vm` context (no `package.json` here).

### fetch(request, env, ctx) — `/api/config` and `/api/videos`

*Signature:* `export default { async fetch(request, env, ctx) }` — static assets are served before it runs.

*What it does:*
- R1: `/api/subscribe` -> `subscribe()`.
- R2: `/api/config` -> 200 `{recurly_public_key: env.RECURLY_PUBLIC_KEY or null}`, `no-store`, so no key sits in the repo.
- R3: `/api/videos` -> Cloudflare's cached answer if any; otherwise up to 12 feed entries as `{videos:[{id,title,published}]}`, 200, cached 30 min; feed failure -> 502 `{videos:[], error:'feed-unavailable'}`.
- R4: any other path -> 404 "Not found".

*Examples:* `GET /api/config` -> `200 {"recurly_public_key":"ewr1-…"}`; `GET /nothing` -> 404.

*Inputs:* the request URL; `env.RECURLY_PUBLIC_KEY`. *Outputs:* JSON, or 404.

*Errors:* feed unreachable -> 502, no `BTB_ALERT`.

*Test:* none automated for R2–R4. `curl -s https://leskobusiness.com/api/config` shows an `ewr1-` key; `curl -s -o /dev/null -w '%{http_code}' https://leskobusiness.com/nothing` shows 404.

## Decisions

- 2026-09-29: the page stopped calling `/api/videos` (Giulia hard-coded six business-grant videos). Open: delete the route, or keep it for a later "latest videos" section — Martin's call.
- 2026-09-30: go live with our own checkout fast and fix issues one by one (Martin). Accepted for now: account code = email, a full-scope private key.
- 2026-09-30: both keys are Worker secrets, not dashboard Text variables — every Workers Builds deploy wipes Text variables (`wrangler.jsonc` has no `vars`).
- 2026-09-30: rate limit keyed on IP, not email — a card-testing script picks a fresh email per call. A strict cap would need a zone WAF rule or Turnstile (Martin's dashboard).
- 2026-09-30: show the buyer the decline reason, no GA4 decline events, no report (Martin); fraud codes stay vague so card testers learn nothing.
- 2026-10-06 (`265f225`, **reverted the same day by `a6b8c00`**): sending the buyer's IP as `billing_info.ip_address` was tried and is impossible on this route. Recurly answers 422 "ip_address cannot be present with token_id", which our S4 validation branch showed the buyer as a 400, so no purchase could complete between roughly 16:17 and 16:47 UTC. Consequence for the open "why do European cards decline" question: the old ClickFunnels route also tokenised with Recurly.js, so it cannot have been sending a cardholder IP either — "our API route is missing the buyer's IP" was never a real difference between the two routes. **Closed the same day, by evidence rather than by docs:** the declined transaction of 2026-10-06 18:52 CEST shows `IP Address 86.227.121.34 (France)` in Recurly's own Fraud Details, a value we never sent. Recurly.js captures the buyer's IP in the browser at tokenisation and carries it on the token, which is exactly why the API refuses a second one. The gateway always had the IP. `265f225` was trying to supply something that was already there.
- 2026-10-06: a decline writes a `BTB_ALERT` line, and `PAYMENT_DECLINED` is added to the seven shared codes. Why: until now a decline existed only in Recurly's dashboard and in whatever screenshot someone happened to take. Its own code rather than `UNEXPECTED`, because on 2026-10-06 declines were 100% of real attempts, and a code that matches the common case cannot flag a bug.
- 2026-10-06: Workers observability on, `head_sampling_rate` written out as `1`. Why: without the block Cloudflare retains no `console` output at all, so the alert line would be written and immediately lost.
- 2026-10-06: what a real decline on this route looks like, from the first one that got through to the gateway (18:52 CEST, Belgian Mastercard, $29.95): error code `declined`, decline code `generic_decline`, gateway error code **2**, Recurly advice "the customer's bank has declined their card". **CVV Result: Match. AVS Result: postal code matches, street address not verified (`P`).** So the card details were right and neither CVV nor AVS caused it, and Authorize.Net code 2 is the issuer's own refusal passed back, not one of our gateway's fraud filters (those return 27, 44, 45, 250-253). The transaction origin shows as **Recurly.js** in the dashboard, not `api` and not `hpp`; the API-level value is **`token_api`** (confirmed 2026-10-07 in `stg_recurly_transactions`). The lesko-checkout overseer needs this, and needs the sting in it: the old ClickFunnels Recurly.js pages arrive as `token_api` too, and it first appears 2026-08-09, before `/checkout` existed — so `origin` alone cannot tell our buyers from theirs. Only an `account_code` containing `@` marks ours, and only on a success, because a declined purchase often persists no account at all. Still open: whether a US-issued card succeeds where this one failed, which is the test that separates "cross-border card-not-present without 3-D Secure" from "something wrong with the merchant account".
- 2026-10-06: Kount (Recurly Fraud Management) is **not available** — the account's plan shows "Upgrade Required", status Disabled. No fraud session is opened during tokenisation, and that stays true until the plan changes.
- 2026-10-09 (draft, not agreed): a wallet token reaches Recurly through this
  same `/api/subscribe` and `POST /purchases`, with no new route. Why: a
  Recurly.js wallet token is a billing token like a card token, so a second
  route would only duplicate the rate limit, the decline mapping and B2.
- 2026-10-09 (`677f220`/`020d83d`, landed `f34be49`): a decline mails Martin, through Cloudflare's `send_email` binding with a fixed `destination_address`. Why a binding and not a log-based alert policy: the global "no alert, no landing" rule's kit is GCP, and Cloudflare has no equivalent, so the Worker does the mailing itself. The FROM address lives on the **subdomain** `alerts.leskobusiness.com` (Cloudflare Email Sending, onboarded per subdomain), never on the bare apex: `leskobusiness.com` already takes live inbound mail through GoDaddy, and Email Routing — the other Cloudflare product, which would also satisfy the binding's "onboarded" requirement — is zone-level and would replace that apex MX outright. Two one-time steps stay open and are Martin's: `wrangler email sending enable alerts.leskobusiness.com` (Workers Paid) and verifying the destination address. Until both are done `env.SEND_EMAIL` is unset and E3 makes the send a no-op.
- 2026-10-09 (open gap, found reviewing `wallet-paypal`): the `BTB_ALERT` line carries ` wallet=<method|card>` (W2) but the decline **email** does not — its body is still only `plan`, `code` and `gateway_error_code`. The email is the thing actually read; the log line has to be gone looking for in Workers Observability. A decline on a wallet and a decline on a card need different fixes, so the one-word difference belongs in both. One line in `sendDeclineAlertEmail`, which needs the same third argument `logDecline` now takes. Left out of the wallet branches on purpose: it is not in either brief's scope, and it touches the decline path they must not regress.
- 2026-10-09 (open defect, not fixed here): S4's 3-D Secure hand-back reads the wrong level. `worker.js` tests `err.three_d_secure_action_token_id` where `err = data.error`, but Recurly v3 puts that token one level deeper, in `error.transaction_error.three_d_secure_action_token_id`. So the test is always `undefined`, the 3DS branch can never fire, and the request falls through to the decline branch — the buyer is told their card was declined at the one moment the bank was willing to approve after a check. `checkout.html` and `buildPurchase()`'s `three_d_secure_action_result_token_id` are both correct; only the hand-back is wrong. Never seen live, because Authorize.Net here is probably not configured for 3DS at all. The fix is to read both levels and cannot break anything, but it needs its own worktree and its own red-first test. Amended 2026-10-12 (overseer review of `wallet-paypal`): that worktree must also fix the **retry**, which is card-only — `checkout.html`'s 3DS branch re-enters its own `subscribe()`, a card-shaped POST with no `wallet` field that re-reads `#email`/`#first_name`/`#last_name` (see wallets.md K3c). Fixing only the hand-back turns a branch that can never fire into one that fires and fails for every wallet buyer, so the two are one task.

<!-- spec:template -->
