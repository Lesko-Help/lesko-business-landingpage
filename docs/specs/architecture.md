# Architecture
Status: as-built 2026-09-30

## Services
- Cloudflare Worker `lesko-business-landingpage` (account
  `c75d24d09764e8db455eaf601ba3b377`): serves every file in the repo folder
  as a static asset (`wrangler.jsonc`, `assets.directory: "."`, minus
  `.assetsignore`) and runs `worker.js` for anything not matched by a file.
  Built and deployed by Cloudflare Workers Builds on every push to `main`.
- Recurly site `leskohelp` (production, USD): the three plans
  `business-monthly` / `business-half-year` / `business-yearly` (tax-exempt).
  Our `/checkout` loads Recurly.js v4 from `js.recurly.com` for the card
  field; `worker.js` calls the v3 API (`POST /purchases`) with the Worker
  secret `RECURLY_API_KEY`. The hosted pages
  `leskohelp.recurly.com/subscribe/<plan>` still work for anyone with the
  link; since 2026-09-30 their return URL is
  `/welcome?email={{account_code}}&plan={{plan_code}}`.
- Workers Rate Limiting binding `SUBSCRIBE_LIMIT` (5 per 60 s per IP) in
  front of `/api/subscribe`.
- Kit form `app.kit.com/forms/...` embedded in the page for the newsletter
  box (account LeskoCommunity).
- YouTube: the "Meet Matthew" section embeds a fixed playlist of six videos
  (hard-coded on 2026-09-29; `worker.js`'s `/api/videos` feed is no longer
  called by the page).
- A Vercel project `lesko-business-landingpage.vercel.app`, frozen at commit
  `9a0a7d4` (2026-08-14): a leftover, not a deploy target *(as-built, not
  intended)*.

## Endpoints
- `GET https://leskobusiness.com/` (and `www.`) — the sales page.
- `GET /checkout?plan=monthly|half-year|yearly` and `GET /welcome?email=…&plan=…`
  — static pages.
- `GET /api/config` — `worker.js`, the Recurly public key for the card field.
- `POST /api/subscribe` — `worker.js`, makes the Recurly purchase; answers
  201/400/402/405/429/502/503 with a buyer-readable message.
- `GET /api/videos` — `worker.js`, latest videos of Matthew's channel as
  JSON; unused by the page since 2026-09-29.
- Outbound: Recurly.js and the Recurly v3 API, the Kit form POST, the
  YouTube embed.

## Data models
None of this repo's own. It writes no table. What a visitor does is
recorded elsewhere: a purchase lands in Recurly and, through
lesko-provisioning's webhook rail, in `provisioning.wh_recurly` and
`provisioning_models.stg_recurly_transactions` (origin `hpp` for the hosted
pages; for our `/checkout` unverified, likely `api`); a newsletter
signup lands in Kit. With the GA4 tag on (landed 2026-09-30, off until a measurement id
exists) page views and button clicks would land in a GA4 property Martin
still has to create.

## Sequences
- Visitor → leskobusiness.com → clicks a plan button →
  `/checkout?plan=<plan>` → Recurly.js makes a card token → `POST
  /api/subscribe` → Recurly `POST /purchases` (a bank check, 3-D Secure, may
  come in between) → `/welcome?email=…&plan=…`; Recurly sends the
  `new_subscription` webhook → lesko-provisioning `wh_recurly` → `lesko-provision-worker`
  `/provision` → Mighty Networks Admin API creates or re-adds the member
  (21 s measured 2026-09-29 via the hosted pages; unproven via `/checkout`) → MN sends its own welcome to a brand-new
  member; a returning member hears nothing (open in lesko-provisioning).
- Giulia → GitHub "upload files" → commit on `main` → Cloudflare build → live
  within a minute.
- Claude worktree → branch → Martin says "land it" → `wt-done.sh` pushes to
  `main` → same Cloudflare build → the overseer compares the live page to
  `origin/main` with curl + cmp.

<!-- spec:template -->
