# worker
Status: as-built 2026-09-30
Kind: helper
Summary: `worker.js`: the checkout's `/api/config` and `/api/subscribe` (Recurly purchase), plus the unused `/api/videos` feed
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-09-30
Reads: the Recurly v3 API (`POST /purchases`, API version v2021-02-25); YouTube's public RSS feed for Matthew's channel (`UCwKJZfa7sWV_qKxQnLBUpjA`, `/api/videos` only).
Writes: a Recurly account + subscription per successful purchase; nothing of its own (no table, no storage besides Cloudflare's cache for `/api/videos`).

## Overview

*What it is for:* take a Recurly.js card token from `/checkout` and turn it into a purchase on a business plan.
*What it owns:* `worker.js`; `main` and the `SUBSCRIBE_LIMIT` rate-limit binding in `wrangler.jsonc`.
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
- S1: rate-limits first, before the method, the key or the body — keyed on `CF-Connecting-IP`, 5 calls per 60 s (`SUBSCRIBE_LIMIT`). Over it: 429 `{ok:false, error:'rate-limited', message:'Too many attempts…'}`. Live enforcement is per Cloudflare location and eventually consistent: on 2026-09-30 the first 429 came at about call 21, not 6.
- S2: anything but POST -> 405; no `RECURLY_API_KEY` -> 503 "Payments are not switched on yet".
- S3: validates `plan` (a key of `PLAN_CODES`), `token`, `email`, `first_name`, `last_name`; a miss -> 400 with a buyer-readable `message`.
- S4: POSTs `/purchases` (currency USD, account code = email, the card token, optional `three_d_secure_action_result_token_id`) and maps Recurly's answer: success -> 201 `{ok:true, plan_code, account_code}`; 3-D Secure wanted -> 402 with `three_d_secure_action_token_id`; declined -> 402 with `declineMessage(te)`; validation -> 400 ("already has an active membership" when Recurly says "already"); Recurly unreachable or anything else -> 502.
- S5: logs `plan` plus, for a decline, only the `code` and `gateway_error_code`; for a validation error or other failure, Recurly's own error text. The worker never logs the email or card data itself *(as-built: Recurly's validation text could quote a field value; unchecked)*.

*Examples:* `POST {}` -> `400 {"ok":false,"message":"Unknown plan. …"}`; the 6th rapid POST from one IP in `wrangler dev` -> 429.

*Inputs:* JSON body `plan`, `token`, `email`, `first_name`, `last_name`, optional `company`, `three_d_secure_action_result_token_id`; header `CF-Connecting-IP`; secret `RECURLY_API_KEY`.

*Outputs:* JSON with status 201/400/402/405/429/502/503, always with a `message` safe to show the buyer (except 201).

*Errors:* failures are shown to the buyer, not alerted — a person is at the page; no `BTB_ALERT`.

*Test:* `scripts/test-subscribe-rate-limit.sh <dir> expect-429` — six rapid POSTs against local `wrangler dev` without a key: five 503, the 6th 429 (S1); red first against `origin/main` (`expect-no-429`). S3/S4 unproven end to end until the first real purchase.

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

<!-- spec:template -->
