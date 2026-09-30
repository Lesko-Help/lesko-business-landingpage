# Brief: subscribe-rate-limit

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Stop card testing on /api/subscribe (known issue accepted at the 2026-09-30 go-live). Add a Cloudflare Workers Rate Limiting binding in wrangler.jsonc (ratelimits, e.g. binding SUBSCRIBE_LIMIT, namespace_id a fixed number, simple limit 5 per 60 s) and in worker.js check it FIRST in /api/subscribe, keyed on the buyer's IP (CF-Connecting-IP), before any key check or Recurly call. Over the limit: answer 429 JSON with a plain message the buyer can read, and confirm checkout.html shows that message instead of a generic error (change checkout.html only if it does not). Everything else in the purchase path stays byte-identical. Prove the guard goes red first: with npx wrangler dev locally (no Recurly keys, so allowed calls answer 503), six quick POSTs to /api/subscribe on origin/main give no 429; on your branch the 6th gives 429. Write that test as a script under docs/ or scripts/ (add to .assetsignore) and put its output in the brief. Plain-language comments on every function touched (input, output, why). Do not touch Cloudflare, Recurly or secrets; do not push. Write a spec proposal for /api/subscribe including the limit into the brief for the overseer to fold into docs/specs/modules/worker.md.

## Done when

`scripts/test-subscribe-rate-limit.sh`: fires six quick `POST /api/subscribe`
against a local `wrangler dev` (no Recurly keys set, so an allowed request
answers 503 "not-configured", not a real purchase). Red against
`origin/main`: all six answer 503, no 429 anywhere. Green on this branch:
the first five answer 503, the sixth answers 429 with a JSON `message` a
buyer can read. Script output pasted into `## Context` below for both runs.

Spec: docs/specs/modules/worker.md updated (proposal below, for the
overseer to fold in — this worktree does not edit docs/specs/ itself).

## May touch

Module: **worker** (`worker.js` + the `main` entry in `wrangler.jsonc`, see
`docs/specs/modules/worker.md`).

- `wrangler.jsonc` — add the `ratelimits` binding (`SUBSCRIBE_LIMIT`, 5 per
  60s).
- `worker.js` — check the binding first in `/api/subscribe`, before the
  `RECURLY_API_KEY` check.
- `checkout.html` — only if it does not already show the 429's `message`
  text (its `finish()` already reads `result.message` off any JSON response
  regardless of HTTP status, so this is expected to need no change — confirm
  and note it rather than editing blind).
- `scripts/test-subscribe-rate-limit.sh` (new) — the red/green proof; add to
  `.assetsignore`.
- `.assetsignore` — list the new script.
- `docs/briefs/subscribe-rate-limit.md` — this file.

Not in scope: Cloudflare dashboard, Recurly, any secret, any other route,
`index.html`, `main` branch, any deploy.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — same as every change here. The
worktree session does not push or deploy; the overseer does, from `main`,
after landing. `wrangler.jsonc`'s new `ratelimits` block needs no dashboard
step (unlike the two secrets): Cloudflare creates the namespace from the
config on the next deploy.

## Context

Overseer memory message: **not received** by the time this brief's first
commit was made (checked `ReadNotifications` and found nothing queued). If
it arrives later, its content will be added here.

Read directly from the repo instead: `docs/specs/modules/worker.md` (stale —
documents only `/api/videos`, nothing about `/api/subscribe`, `/api/config`
or the checkout route; this is a known gap, not a task blocker, since the
brief's own done-when already stands in for a spec here). `checkout.html`'s
`subscribe()`/`finish()` (lines ~307-345): `finish()` calls
`showError(result.message || '<generic>')` for any non-`ok` JSON body,
regardless of the HTTP status code that carried it — so a 429 with a
`message` field should already surface correctly with no edit, pending
confirmation in the browser-equivalent test below.

Cloudflare Workers Rate Limiting binding format confirmed via
`developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/`
(fetched 2026-09-30): `wrangler.jsonc` top-level `ratelimits: [{name,
namespace_id, simple: {limit, period}}]` (period must be 10 or 60);
code calls `await env.<name>.limit({key})` -> `{success: boolean}`; needs
wrangler >= 4.36.0 (this repo has 4.144.0). `wrangler dev` simulates the
binding locally, so the red/green proof needs no Cloudflare account access
and no deploy.

Test script output: (filled in after the script is written and run against
both `origin/main` and this branch — see `## State` and the report to the
overseer for the actual transcript).

## Spec proposals

Proposed addition to `docs/specs/modules/worker.md`, a new `### subscribe`
and `### config` entry under `## Functions` (the file currently documents
only `fetch`'s `/api/videos` branch):

> ### subscribe(request, env) — the `/api/subscribe` branch of `fetch`
>
> *What it does:*
> - S1: rate-limits first, before reading the body or checking any key —
>   keyed on `CF-Connecting-IP`, 5 requests per 60 seconds per IP (the
>   `SUBSCRIBE_LIMIT` binding in `wrangler.jsonc`, Cloudflare Workers Rate
>   Limiting). Over the limit: 429 JSON `{ok: false, error: 'rate-limited',
>   message: 'Too many attempts. Please wait a minute and try again, or
>   email support@lesko.help.'}`.
> - S2: method must be POST (405 otherwise); needs `RECURLY_API_KEY` set
>   (503 "not configured" otherwise, so a card-testing burst under the
>   limit still cannot reach Recurly without the secret).
> - S3: validates `plan`, `token`, `email`, `first_name`, `last_name` from
>   the JSON body; 400 with a buyer-readable `message` on any miss.
> - S4: POSTs a `purchases` call to Recurly with the card token, and maps
>   Recurly's answer to 201 (`ok:true`), 402 (3-D Secure needed, or card
>   declined), 400 (validation, incl. "already a member"), or 502 (anything
>   else) — each with a `message` a buyer can read.
>
> *Inputs:* the POST body (`plan`, `token`, `email`, names, optional
> `company` and `three_d_secure_action_result_token_id`); the caller's IP
> via `CF-Connecting-IP`; the `RECURLY_API_KEY` secret.
>
> *Outputs:* JSON, one of 201/400/402/405/429/502/503, always with a
> `message` string safe to show the buyer.
>
> *Why the rate limit is keyed on IP, not email:* the attack this stops is
> a card-testing script trying many stolen card numbers fast from one
> place; the email field is attacker-chosen and free to change per request,
> so it cannot gate anything.
>
> *Test:* `scripts/test-subscribe-rate-limit.sh` — six rapid POSTs against
> `wrangler dev` (no `RECURLY_API_KEY`), asserts the 6th is 429 and the
> first 5 are 503.

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done:
In flight (file:line):
Next:
Traps (with dates):
