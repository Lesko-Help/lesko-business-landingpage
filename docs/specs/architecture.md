# Architecture
Status: as-built 2026-09-30

## Services
- Cloudflare Worker `lesko-business-landingpage` (account
  `c75d24d09764e8db455eaf601ba3b377`): serves every file in the repo folder
  as a static asset (`wrangler.jsonc`, `assets.directory: "."`, minus
  `.assetsignore`) and runs `worker.js` for anything not matched by a file.
  Built and deployed by Cloudflare Workers Builds on every push to `main`.
- Recurly site `leskohelp` (production, USD): the hosted checkout pages
  `leskohelp.recurly.com/subscribe/<plan>`; the plans are tax-exempt and have
  no `success_url`.
- Kit form `app.kit.com/forms/...` embedded in the page for the newsletter
  box (account LeskoCommunity).
- YouTube: the "Meet Matthew" section embeds a fixed playlist of six videos
  (hard-coded on 2026-09-29; `worker.js`'s `/api/videos` feed is no longer
  called by the page).
- A Vercel project `lesko-business-landingpage.vercel.app`, frozen at commit
  `9a0a7d4` (2026-08-14): a leftover, not a deploy target *(as-built, not
  intended)*.

## Endpoints
- `GET https://leskobusiness.com/` (and `www.`) — the page.
- `GET /api/videos` — `worker.js`, returns the latest videos of Matthew's
  channel as JSON; unused by the page since 2026-09-29.
- Outbound only: the three Recurly hosted-page URLs, the Kit form POST, the
  YouTube embed.

## Data models
None of this repo's own. It writes no table. What a visitor does is
recorded elsewhere: a purchase lands in Recurly and, through
lesko-provisioning's webhook rail, in `provisioning.wh_recurly` and
`provisioning_models.stg_recurly_transactions` (origin `hpp`); a newsletter
signup lands in Kit. With the GA4 tag on (PR #4, off until a measurement id
exists) page views and button clicks would land in a GA4 property Martin
still has to create.

## Sequences
- Visitor → leskobusiness.com → clicks a plan button →
  `leskohelp.recurly.com/subscribe/<plan>` → pays → Recurly `new_subscription`
  webhook → lesko-provisioning `wh_recurly` → `lesko-provision-worker`
  `/provision` → Mighty Networks Admin API creates or re-adds the member
  (21 s measured 2026-09-29) → MN sends its own welcome to a brand-new
  member; a returning member hears nothing (open in lesko-provisioning).
- Giulia → GitHub "upload files" → commit on `main` → Cloudflare build → live
  within a minute.
- Claude worktree → branch → Martin says "land it" → `wt-done.sh` pushes to
  `main` → same Cloudflare build → the overseer compares the live page to
  `origin/main` with curl + cmp.

<!-- spec:template -->
