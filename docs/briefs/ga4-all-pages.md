# Brief: ga4-all-pages

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Google Analytics (GA4) on the whole website, not only index.html. DECISION BY MARTIN 2026-09-30; no GA4 property exists yet, so it stays switched off until one Measurement ID is filled in. Move the existing GA4 block at the end of index.html (PR #4: off while GA4_MEASUREMENT_ID is empty, EU/EEA/UK/CH visitors get no analytics cookies, no consent banner) into ONE shared readable file, e.g. assets/analytics.js, holding the single GA4_MEASUREMENT_ID, and include it on index.html, checkout.html and welcome.html. Keep index.html's existing events (begin_checkout with plan + price, join_button_click, generate_lead) working. Add: on /checkout a page view with the plan, and add_payment_info when the buyer presses Pay; on /welcome a purchase event (plan, value, currency USD) sent once per visit (guard against reloads). Never send name, email, card or address to GA4, and drop the email query parameter from the page_location sent on /welcome. Remove the Recurly hosted-page linker only if nothing uses it. Do not touch worker.js (another worktree, decline-reasons, is changing it). Change no copy. Test: a browser check (real Chrome via claude-in-chrome, or a local wrangler dev) with a dummy G-TEST id showing the gtag calls in window.dataLayer on each page and none with an empty id; red/green against origin/main; paste results in the brief, then set the id back to empty. Plain-language comments on every block touched; Giulia reads index.html. Do not push.

## Done when

`scripts/test-ga4-events.sh` (a jsdom-based harness — no `claude-in-chrome` tool
and no `wrangler` are available in this worktree session, see Context) prints
PASS for every check below on all three pages, exit code 0:

- with `GA4_MEASUREMENT_ID` patched in memory to `G-TEST`: `index.html` fires
  `begin_checkout` (with plan + price) on a `/checkout?plan=...` link click,
  `join_button_click` on the `#pricing` link, `generate_lead` on the
  newsletter form submit; `checkout.html` fires a `page_view`-carrying
  `config` call with the plan, and `add_payment_info` (with plan + price) when
  the buyer presses Pay with a valid form; `welcome.html` fires a `purchase`
  event (plan, value, `currency: 'USD'`) once, a second run in the same
  session does not fire it again, and no dataLayer entry anywhere contains the
  buyer's email.
- with `GA4_MEASUREMENT_ID` left as shipped (empty): zero `gtag`/`dataLayer`
  calls happen on any of the three pages, for any of the above actions.

Run red first against a scratch copy of `origin/main` (fails: no
`assets/analytics.js`, no analytics code at all on `checkout.html` or
`welcome.html`), then green against this branch. Output pasted below under
Context once both runs are done.

Spec: unchanged — `docs/specs/` is not this worktree's to write. See Spec
proposals for what `docs/specs/modules/page.md` should say once the overseer
applies it.

## May touch

Module: `page` (`docs/specs/modules/page.md`) — `index.html`, and the new
shared `assets/analytics.js`. Also `checkout.html` and `welcome.html`, named
explicitly in the goal but not modeled in any module spec yet (`page.md`
excludes the checkout; `worker.md` doesn't mention either page) — coded
straight from this brief's Done when, per the no-spec rule. Test-only:
`scripts/test-ga4-events.mjs` and `scripts/test-ga4-events.sh` (`scripts/` is
already in `.assetsignore`). Not `worker.js` (owned right now by the
`decline-reasons` worktree). No copy changed on any page.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) once the overseer lands it — same
deploy as every other change to the `page` module. Ships with
`GA4_MEASUREMENT_ID` empty in `assets/analytics.js`, so nothing changes on
`leskobusiness.com` until Martin creates a GA4 property and fills the id in
(and, separately, until Recurly's Hosted Page Settings get the same id, for
buyers who still land on `/welcome` from a Recurly hosted page).

## Context

Overseer memory message, received 2026-09-30 (after the exploration below had
already started — arrived in time for this first commit):
- Martin owns no GA4 property yet (memory `project_lesko_ga4_analytics`). The
  shared file ships with `GA4_MEASUREMENT_ID = ''`, sending nothing. `G-TEST`
  is for the local test only, then reset.
- The existing block (PR #4, merged 2026-09-30) sits at the end of
  `index.html`; gives EU/EEA/UK/CH visitors no analytics cookies (no consent
  banner) — keep that; fires `begin_checkout`, `join_button_click`,
  `generate_lead`.
- The branded `/checkout` went live 13:20Z. Buyers no longer go to
  `leskohelp.recurly.com`, but Recurly's hosted pages still work for anyone
  with the link, and their return URL is
  `/welcome?email={{account_code}}&plan={{plan_code}}`. So `/welcome` gets
  visitors from both routes. The linker to `leskohelp.recurly.com` is
  probably unused now — remove it only if nothing on the site links there,
  and say which was chosen.
- `/welcome` carries the email in the URL; it must never reach Google — strip
  it from `page_location` and don't read it into any event.
- Traps: `assets/analytics.js` IS served publicly (`assets.directory: "."`),
  which is correct for a page script — checked `.assetsignore` does not hide
  it. `llms.txt` and `sitemap.xml` need no change (they don't reference
  analytics). Giulia edits `index.html` copy on `main` — `git fetch`/merge
  `origin/main` before reporting. No push.

Own findings from reading the repo before coding:
- Nothing in the repo links to `leskohelp.recurly.com` anymore except one
  stale HTML comment in `index.html` (line ~2614) and the linker call itself
  — confirmed by `grep -rn "leskohelp.recurly.com"`. So the linker
  (`gtag('set', 'linker', {domains: ['leskohelp.recurly.com']})`) has nothing
  left to attach to; it is removed in this change, not kept.
- The current GA4 block's click detector
  (`planCodeOf`) only matches `leskohelp.recurly.com/subscribe/<plan>`, but
  the pricing buttons already point at `/checkout?plan=<plan>` since commit
  `b4a479e` — so `begin_checkout` currently never fires at all on
  `origin/main`. This is a real, pre-existing bug; fixing the pattern to
  match `/checkout?plan=<plan>` is required to satisfy the goal's own "keep
  ... events ... working". See Spec proposals: `page.md`'s Functions section
  (R3) and Screens section still describe the old Recurly-hosted-page link,
  and need the overseer to update them.
- Site-wide the plan identifier is the short code (`monthly` / `half-year` /
  `yearly`) — used in the checkout links, `checkout.html`'s own `PLANS` map,
  and `welcome.html`'s query string. `worker.js`'s `PLAN_CODES` maps these to
  Recurly's own plan codes (`business-monthly`, ...) only at the API-call
  boundary. `assets/analytics.js`'s `PLAN_PRICES_USD` uses the short codes as
  the primary key (with a `business-` prefix stripped as a fallback), so
  `begin_checkout` / `add_payment_info` / `purchase` all report the plan the
  same way across all three pages.
- No `claude-in-chrome` tool and no `wrangler` binary are available to this
  worktree session (checked via `ToolSearch` and `which`); `npx wrangler
  --version` does work (network access confirmed), but a real page in a
  headless Cloudflare Worker still needs a real browser to read
  `window.dataLayer` back out, which this session cannot drive. Built a
  dependency-light `jsdom` harness instead (installed on demand into a
  scratch `npm` prefix by `scripts/test-ga4-events.sh`, never committed to
  the repo) that loads each page's own HTML, runs its `<script>` tags in
  document order exactly as authored (external `src=` ones read from the
  local file, patched to `G-TEST` only in memory for the "on" run), fires the
  same clicks/submits a visitor would, and reads `window.dataLayer` back.
  This proves the same thing the goal's browser check asks for, without ever
  writing `G-TEST` into the shipped file — so there is no "set the id back to
  empty" step to forget. Flagged to the overseer as a methodology choice, not
  a spec conflict.

Test output:

Red, against a scratch copy of `origin/main` (`git archive origin/main | tar
-x -C <scratch dir>`, commit `2a1ae8a`) — 11 of 17 checks fail, exactly the
ones the goal describes as missing or broken today:

```
PASS - index.html has a /checkout?plan= link to click
PASS - index.html has the newsletter form
FAIL - index.html: begin_checkout fires on the checkout link click
FAIL - index.html: begin_checkout carries currency USD and a plan value
FAIL - index.html: join_button_click fires on #pricing
FAIL - index.html: generate_lead fires on the newsletter submit
FAIL - checkout.html: config call carries the plan
FAIL - checkout.html: add_payment_info fires when Pay is pressed with a valid form
FAIL - checkout.html: add_payment_info carries currency USD and the yearly price
FAIL - welcome.html: purchase fires once with plan, value and currency USD
FAIL - welcome.html: page_location was overridden
FAIL - welcome.html: page_location does not carry the email
PASS - welcome.html: no dataLayer entry anywhere contains the email
FAIL - welcome.html: purchase does not fire again on a simulated reload
PASS - index.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - checkout.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - welcome.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
11 CHECK(S) FAILED
```

(The three `index.html` failures include `begin_checkout`/`join_button_click`/
`generate_lead`, confirming the dead click-pattern bug above: on `origin/main`
none of the three existing events fire at all today, not just the two new
pages' events.)

Green, this branch (commit `8632eca`), same harness, same 17 checks:

```
PASS - index.html has a /checkout?plan= link to click
PASS - index.html has the newsletter form
PASS - index.html: begin_checkout fires on the checkout link click
PASS - index.html: begin_checkout carries currency USD and a plan value
PASS - index.html: join_button_click fires on #pricing
PASS - index.html: generate_lead fires on the newsletter submit
PASS - checkout.html: config call carries the plan
PASS - checkout.html: add_payment_info fires when Pay is pressed with a valid form
PASS - checkout.html: add_payment_info carries currency USD and the yearly price
PASS - welcome.html: purchase fires once with plan, value and currency USD
PASS - welcome.html: page_location was overridden
PASS - welcome.html: page_location does not carry the email
PASS - welcome.html: no dataLayer entry anywhere contains the email
PASS - welcome.html: purchase does not fire again on a simulated reload
PASS - index.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - checkout.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - welcome.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
ALL PASS
```

Run with `./scripts/test-ga4-events.sh <dir>`; `GA4_MEASUREMENT_ID` in the
shipped `assets/analytics.js` was never edited — the "on" run patches `G-TEST`
into the file's content in the test process's own memory only (see Context
above), so there was no "set it back to empty" step to do or forget.

## Spec proposals

`docs/specs/modules/page.md`'s "GA4 tag" Functions entry and its Screens
section both still describe the pre-`/checkout` world (buttons linking
straight to `leskohelp.recurly.com/subscribe/<plan>`, GA4 code inline at the
end of `index.html`). Proposed replacement for the overseer to apply once
this branch lands:

- Screens section: buttons now link to `/checkout?plan=<plan>`, not to
  Recurly directly.
- Functions section: rename the entry from "GA4 tag (inline `<script>` at the
  end of `<body>`)" to "GA4 tag (`assets/analytics.js`, shared with
  `checkout.html` and `welcome.html`; `index.html` keeps only its own
  click/submit handlers inline)". R3 should read: "a click on a link whose
  href matches `/checkout?plan=<plan>` sends `begin_checkout` ..." instead of
  the `leskohelp.recurly.com` pattern. Also worth a line noting `checkout.html`
  and `welcome.html` now carry their own GA4 events (`page_view`+plan,
  `add_payment_info`, `purchase`) but are not yet modeled by any module spec
  — the overseer's call whether they belong under `page.md` or get their own.

## State

Done:
- Read `page.md`/`worker.md`/`INDEX.md`; confirmed neither models
  `checkout.html`/`welcome.html`, so those are coded from this brief's Done
  when, not a spec.
- Read the existing GA4 block in `index.html` (was lines 3166-3288), and the
  relevant parts of `checkout.html` and `welcome.html`.
- Confirmed no `claude-in-chrome`/`wrangler` available; confirmed `npx` has
  network access.
- Wrote `assets/analytics.js` (shared init/track/planPriceUSD, linker
  removed, plan prices keyed by short code).
- Rewrote `index.html`'s GA4 block to use the shared file, and fixed
  `planCodeOf` to match `/checkout?plan=<plan>` instead of the dead Recurly
  pattern.
- Added the shared script tag, `LeskoAnalytics.init({ plan: plan })` and the
  `add_payment_info` call (right after `if (!collect()) return;`, before the
  card-token request) to `checkout.html`.
- Added the shared script tag, email/account_code/account-stripped
  `page_location`, and the once-per-visit `purchase` event (sessionStorage
  guard) to `welcome.html`.
- Wrote `scripts/test-ga4-events.mjs` (jsdom harness) and
  `scripts/test-ga4-events.sh` (installs jsdom into a scratch npm prefix);
  committed as `9aa0034`.
- Ran red against a scratch copy of `origin/main` (`git archive`, commit
  `2a1ae8a`): 11 of 17 checks failed. Ran green against this branch: all 17
  pass. Both outputs pasted under Context above.
- Committed the implementation (`assets/analytics.js` + all three HTML files)
  as one commit, `8632eca`.

Next:
- `git fetch && git merge origin/main` before reporting (Giulia may have
  pushed copy edits to `main` meanwhile) — no divergence expected since this
  branch matched `origin/main` at `2a1ae8a` as of start.
- Commit this brief update (closing State + test output) as the final commit.
- `git add -N .`, clean `git status`, then `wt-done.sh --check ga4-all-pages`
  before reporting to the overseer (`landing-opzichter`).
- Report to the overseer: branch, commit range, HEAD sha, no uncommitted work,
  five-line summary, how Done when was proven, deploy implications. Reply to
  the overseer's earlier cross-session memory message as part of that report.
- Wait for the overseer's review verdict.

Traps (with dates):
- 2026-09-30: the pricing-button click pattern in the shipped GA4 code never
  matched the actual button hrefs (`/checkout?plan=...` since `b4a479e`), so
  `begin_checkout` silently never fired on `origin/main` — check any future
  click-tracking regex against the *current* href, not the comment above it.
- 2026-09-30: no `claude-in-chrome` and no `wrangler` in a worker session —
  don't assume either is available; a jsdom-based harness reading local files
  directly (no dev server) is the fallback used here.
