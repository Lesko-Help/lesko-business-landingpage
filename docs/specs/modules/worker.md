# worker
Status: as-built 2026-09-30
Kind: helper
Summary: `worker.js`: the `/api/videos` feed, unused by the page since 2026-09-29
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-09-30
Reads: YouTube's public RSS feed for Matthew's channel (`UCwKJZfa7sWV_qKxQnLBUpjA`), no auth.
Writes: nothing; answers `GET /api/videos` with JSON and caches it 30 minutes in Cloudflare's cache.

## Overview

*What it is for:* give the page the channel's latest videos as JSON, so the "Meet Matthew" carousel could show them.
*What it owns:* `worker.js`, and the `main` entry in `wrangler.jsonc`.
*What it depends on:* YouTube's feed staying at `youtube.com/feeds/videos.xml?channel_id=...`.
*Public entry points:* `fetch(request)` — the Worker's only handler; `/api/videos` inside it.
*Not in scope:* the page; any route but `/api/videos` (everything else is a static file, or 404).
*Secrets:* none.
*Personal data:* none.

Used by: nobody since 2026-09-29 — `index.html` now carries a hard-coded list of six videos and never calls `/api/videos` *(as-built, not intended: the route still runs and still fetches YouTube on demand)*.

## Functions

### fetch(request, env, ctx)

*Signature:* `export default { async fetch(request, env, ctx) }` — the Cloudflare Workers handler; static assets are served before it runs.

*What it does:*
- R1: when the path is `/api/videos` and Cloudflare's cache has an answer, it returns the cached response.
- R2: otherwise it fetches the channel feed, parses up to 12 `<entry>` blocks into `{id, title, published}`, answers 200 with `{videos: [...]}` and `cache-control: public, max-age=1800`, and stores it in the cache.
- R3: when the feed fetch fails, it answers 502 with `{videos: [], error: 'feed-unavailable'}` and `no-store`.
- R4: any other path answers 404 "Not found".

*Examples:* `GET /api/videos` -> `200 {"videos":[{"id":"X98GKGcyr5o","title":"...","published":"2026-..."}, ...]}`; `GET /nothing` -> `404`.

*Inputs:* the request URL.

*Outputs:* a JSON response, or 404.

*Errors:* feed unreachable or non-2xx -> HTTP 502 -> no `BTB_ALERT` (a person is watching the page; nothing unattended runs here).

*Test:* none automated. `curl -s https://leskobusiness.com/api/videos | head -c 200` shows the JSON; `curl -s -o /dev/null -w '%{http_code}' https://leskobusiness.com/nothing` shows 404. A worktree that changes this file writes a real test first, red against `origin/main`.

## Decisions

- 2026-09-29: the page stopped calling this route (Giulia hard-coded six business-grant videos, because the channel's latest were not about business grants). Open: delete the worker and `main` in `wrangler.jsonc`, or keep it for a later "latest videos" section — Martin's call.

<!-- spec:template -->
