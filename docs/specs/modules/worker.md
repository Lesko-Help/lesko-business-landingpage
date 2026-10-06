# worker
Status: as-built 2026-10-06
Kind: helper
Summary: `worker.js` (+ `raillog.js`): the checkout's `/api/config` and `/api/subscribe` (Recurly purchase), plus the unused `/api/videos` feed
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-10-06
Reads: the Recurly v3 API (`POST /purchases`, API version v2021-02-25); YouTube's public RSS feed for Matthew's channel (`UCwKJZfa7sWV_qKxQnLBUpjA`, `/api/videos` only).
Writes: a Recurly account + subscription per successful purchase; one `BTB_ALERT` line to Workers Logs per card decline (see `alert()`); nothing else of its own (no table, no storage besides Cloudflare's cache for `/api/videos`).

## Overview

*What it is for:* take a Recurly.js card token from `/checkout` and turn it into a purchase on a business plan.
*What it owns:* `worker.js` and `raillog.js`; `main`, the `SUBSCRIBE_LIMIT` rate-limit binding and the `observability` block in `wrangler.jsonc`.
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
- S4: builds the payload with `buildPurchase()` — currency USD, account code = email, the card token, the caller's IP as `billing_info.ip_address` when Cloudflare supplied one, optional `three_d_secure_action_result_token_id` — POSTs it to `/purchases` and maps Recurly's answer: success -> 201 `{ok:true, plan_code, account_code}`; 3-D Secure wanted -> 402 with `three_d_secure_action_token_id`; declined -> 402 with `declineMessage(te)`; validation -> 400 ("already has an active membership" when Recurly says "already"); Recurly unreachable or anything else -> 502.
- S5: a decline prints one alert line through `logDecline(plan, te)` — `BTB_ALERT lesko-business-landingpage/api-subscribe PAYMENT_DECLINED: plan=… code=… gateway_error_code=…` — carrying those three values and nothing else: never `te.message`, never the buyer-facing sentence, never the email or card. A validation error or other failure still prints a plain `console.log` with Recurly's own error text. The worker never logs the email or card data itself *(as-built: Recurly's validation text could quote a field value; unchecked)*.

*Examples:* `POST {}` -> `400 {"ok":false,"message":"Unknown plan. …"}`; the 6th rapid POST from one IP in `wrangler dev` -> 429.

*Inputs:* JSON body `plan`, `token`, `email`, `first_name`, `last_name`, optional `company`, `three_d_secure_action_result_token_id`; header `CF-Connecting-IP` (rate-limit key *and* the IP sent to Recurly); secret `RECURLY_API_KEY`.

*Outputs:* JSON with status 201/400/402/405/429/502/503, always with a `message` safe to show the buyer (except 201).

*Errors:* 400, 429, 502, 503 are shown to the buyer and not alerted — a person is at the page. A **decline (402) is both**: the buyer sees `declineMessage(te)` and one `BTB_ALERT … PAYMENT_DECLINED` line is written, because a decline is the one failure nobody can see afterwards otherwise *(open 2026-10-06: the line lands in Workers Logs, but no alert policy emails it yet — the global "no alert, no landing" rule is only half met here; the kit behind that rule is GCP, this runnable is Cloudflare)*.

*Test:* `scripts/test-subscribe-rate-limit.sh <dir> expect-429` — six rapid POSTs against local `wrangler dev` without a key: five 503, the 6th 429 (S1); red first against `origin/main` (`expect-no-429`).
`node scripts/test-subscribe-build-purchase.js worker.js` — S4's payload shape: the IP lands in `billing_info.ip_address`, an empty IP leaves the key out entirely, a 60-char IP is cut to 45, and the 3DS token still rides along; red first against `origin/main` (`buildPurchase is not defined`).
`node scripts/test-subscribe-decline-alert.js worker.js raillog.js` — S5, composing the real `logDecline()` with the real `alert()` (no stubs): the captured line starts with the `BTB_ALERT` prefix, carries both ids, and contains neither `te.message` nor any email; red first against `origin/main`.
S3 and the live S4 call stay unproven end to end until the first real purchase.

### buildPurchase(ip, plan, token, email, first, last, company, tds)

*Signature:* `function buildPurchase(ip, plan, token, email, first, last, company, tds)` — called from `subscribe()` once the body has passed S3.

*What it does:*
- B1: returns the exact object POSTed to Recurly's `/purchases`: `currency: 'USD'`, the account (code = email, email, first and last name), and one subscription on the mapped `plan_code`.
- B2: sets `billing_info.ip_address` to the caller's IP, cleaned and cut to 45 characters (the longest an IPv6 address can be written out), **only when the IP is non-empty** — Recurly rejects an empty string, so the key is left out rather than sent blank. Recurly's own client marks this field strongly recommended: it is what lets the gateway's geolocation and velocity checks run at all, and what makes a disputed charge traceable.
- B3: adds `company` only when the buyer typed one, and `three_d_secure_action_result_token_id` only on the second attempt after a bank check.

*Examples:* `buildPurchase('81.82.1.1', 'monthly', 'tok', …)` -> `…account.billing_info = {token_id:'tok', ip_address:'81.82.1.1'}`; the same call with `''` -> `{token_id:'tok'}`, no `ip_address` key.

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
- 2026-10-06: send the buyer's IP to Recurly on every purchase attempt. Why: the API route never sent one, so the gateway's geolocation and velocity checks had nothing to run on, while the old ClickFunnels and hosted-page routes did send it — one real difference between the route that used to take payments and the one that has taken none.
- 2026-10-06: a decline writes a `BTB_ALERT` line, and `PAYMENT_DECLINED` is added to the seven shared codes. Why: until now a decline existed only in Recurly's dashboard and in whatever screenshot someone happened to take. Its own code rather than `UNEXPECTED`, because on 2026-10-06 declines were 100% of real attempts, and a code that matches the common case cannot flag a bug.
- 2026-10-06: Workers observability on, `head_sampling_rate` written out as `1`. Why: without the block Cloudflare retains no `console` output at all, so the alert line would be written and immediately lost.
- 2026-10-06: Kount (Recurly Fraud Management) is **not available** — the account's plan shows "Upgrade Required", status Disabled. No fraud session is opened during tokenisation, and that stays true until the plan changes.

<!-- spec:template -->
