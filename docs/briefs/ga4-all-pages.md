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

Correction (from the overseer's round-2 review, worth being precise about):
of those three `index.html` failures, only `begin_checkout` is a real,
provable-live bug — its click detector matches
`leskohelp.recurly.com/subscribe/<plan>`, which nothing on the site links to
any more (see "Own findings" above), so that event genuinely never fires on
`origin/main` today. `join_button_click` and `generate_lead` show FAIL in
this red run for a different, less interesting reason: `origin/main` has no
`assets/analytics.js` (or `site-events.js`) at all, so the harness's
`forcedId` patch — which is what turns any of `index.html`'s events on for
this test — has nothing to patch, and every event necessarily reads as "not
firing" regardless of whether its own trigger logic works. So this red run
does not show that `join_button_click` or `generate_lead` are broken live;
it shows that `origin/main` has no shared analytics file yet, which is
exactly the goal this branch fixes.

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

Round 2 (overseer review): checkout.html and welcome.html called
`window.LeskoAnalytics.*` with no guard — if the shared script fails to load
(ad blocker, network error), that throws and halts the rest of that page's
own inline script: checkout would show no plan and a dead Pay button, welcome
would never show the buyer's email. Fixed by renaming the shared file to
`assets/site-events.js` (ad-blocker lists commonly target `*/analytics.js`),
adding a no-op `window.LeskoAnalytics` fallback stub on all three pages right
after the shared script tag, and wrapping welcome.html's `sessionStorage`
calls (which can themselves throw when storage is blocked) in try/catch. The
harness gained a `blockAnalytics` mode (skips the shared script's own
`<script>` tag entirely, as a blocked/failed load would) plus per-script
error isolation (one block's error no longer aborts the whole page load in
the test, matching a real browser), and four new checks.

Red, against a scratch copy of this branch's own pre-fix commit `971719b`
(`git archive 971719b | tar -x -C <scratch dir>`, with this branch's current,
already-fixed `scripts/test-ga4-events.mjs` copied over the scratch copy's —
the harness itself is what changed, not just the pages) — exactly the 4 new
checks fail, nothing else:

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
FAIL - checkout.html: still shows the plan summary when site-events.js is blocked
FAIL - checkout.html: pressing Pay does not throw when site-events.js is blocked
FAIL - welcome.html: still shows the buyer's email when site-events.js is blocked
FAIL - welcome.html: does not throw when site-events.js is blocked
PASS - index.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - checkout.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - welcome.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
4 CHECK(S) FAILED
```

Green, this branch (commit `9145b17` plus the harness update), all 21 checks:

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
PASS - checkout.html: still shows the plan summary when site-events.js is blocked
PASS - checkout.html: pressing Pay does not throw when site-events.js is blocked
PASS - welcome.html: still shows the buyer's email when site-events.js is blocked
PASS - welcome.html: does not throw when site-events.js is blocked
PASS - index.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - checkout.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
PASS - welcome.html: sends nothing while GA4_MEASUREMENT_ID is empty, as shipped
ALL PASS
```

One catch found while producing this red run: the harness's `blockAnalytics`
mode originally matched only the literal path `/assets/site-events.js`, so
against round-1's code (still named `assets/analytics.js` there) it matched
nothing — the "blocked" run silently loaded the real file anyway and all 4
checks passed, a false green. Fixed by matching either name
(`isSharedAnalyticsSrc` in the harness), which is what produced the correct
red result above.

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

Done (round 1, reported to the overseer, HEAD was `971719b`):
- Wrote `assets/analytics.js` (shared init/track/planPriceUSD, linker
  removed, plan prices keyed by short code); wired into all three pages;
  fixed the dead `planCodeOf` click pattern in `index.html`.
- Wrote `scripts/test-ga4-events.mjs`/`.sh` (jsdom harness); red (11/17 fail)
  against a scratch `origin/main` (`2a1ae8a`), green (17/17) here.
  Committed: `1580185` brief, `9aa0034` test scripts, `8632eca` implementation,
  `bbf2749` merge of `origin/main` (decline-reasons, worker.js only, no
  overlap), `971719b` brief close-out. Reported to `landing-opzichter`.

Overseer's round-2 verdict (received after the report above) — not ready,
one blocking fix and two small ones:
1. BLOCKING: `checkout.html`/`welcome.html` called `window.LeskoAnalytics.*`
   unguarded. If `assets/analytics.js` fails to load (ad blockers commonly
   block paths ending `/analytics.js`; also plain network errors), that threw
   and stopped the rest of that page's own inline script — checkout showed no
   plan/no card field/dead Pay button, welcome never showed the buyer's email.
2. `welcome.html`'s `sessionStorage.getItem/setItem` was outside any
   try/catch — same failure mode where storage is blocked.
3. Add a harness case that goes red on the current (round-1) code: load
   checkout/welcome with the analytics script missing, assert the page still
   works. Red first, then green; paste both.
   Also: reword the brief — on `origin/main`, `join_button_click`/
   `generate_lead` only fail in the red run because the harness turns
   analytics on inside `analytics.js`, which `main` doesn't have; they are not
   proven broken live. Only `begin_checkout`'s click pattern really is.
   Merge `origin/main` again (now `97ba192`, specs only) and report back.

Done (round 2, in progress this pass):
- Renamed `assets/analytics.js` → `assets/site-events.js` everywhere (script
  tags in all 3 pages, both test scripts, comments) — overseer left the
  rename as this worker's call; chosen because "analytics.js" is a filename
  several blocklists target by name, and the goal's own text only ever said
  "e.g. assets/analytics.js".
- Added a `window.LeskoAnalytics = window.LeskoAnalytics || {stub}` guard
  (inert init/track/isOn/planPriceUSD) right after the shared `<script src>`
  tag on all three pages, so a blocked/missing/erroring `site-events.js`
  leaves every page fully working.
- Wrapped `welcome.html`'s `LeskoAnalytics.init(...)` + the sessionStorage
  purchase-guard block in one `try { ... } catch (e) {}`.
- Rewrote `loadPage()` in `scripts/test-ga4-events.mjs` to take a 4th
  `blockAnalytics` arg (skips loading `site-events.js` entirely, simulating a
  block) and to catch each `<script>` block's own error into
  `window.__scriptErrors` instead of letting it abort the whole page load —
  matches real-browser per-block isolation, needed so a still-broken guard
  shows up as a *failed check*, not a crashed test run.
- Added 4 new checks: checkout.html's plan summary + Pay-press still work,
  welcome.html's email box still shows the email, both with
  `site-events.js` blocked.
- Proved red-then-green as the overseer asked: red against a scratch copy of
  round-1 HEAD (`971719b`, this branch's own updated harness copied over it)
  — exactly the 4 new checks fail, nothing else; green here — all 21 pass.
  While producing the red run, found and fixed a false-green in the harness
  itself: `blockAnalytics` matched only the literal path
  `/assets/site-events.js`, so it matched nothing on round-1's code (still
  named `analytics.js` there) and silently loaded the real file instead of
  blocking it. Fixed with `isSharedAnalyticsSrc()`, matching either name.
- Reworded the Test output section's framing of the round-1 red run per the
  overseer's correction: only `begin_checkout` is a real, provable-live bug;
  `join_button_click`/`generate_lead` only read as failing there because the
  harness's id-patch has no `analytics.js`/`site-events.js` to patch on
  `origin/main`, not because their own trigger logic is broken.
- Committed the product fix as `9145b17` (rename + guard stubs + try/catch).
  Still to commit: the harness update (`scripts/test-ga4-events.mjs`, staged)
  and this brief update, each as its own commit — "one idea per commit".

Next (pick up here):
- Commit the harness update, then this brief update, as two separate commits.
- `git fetch && git merge origin/main` again (overseer said it's at
  `97ba192`, specs only) — check for conflicts, confirm `docs/specs/` wasn't
  independently touched by this worktree (it wasn't; only proposed above).
- `git add -N .`, clean `git status`, `wt-done.sh --check ga4-all-pages`.
- Report back to `landing-opzichter`: what changed since round 1, the new
  red/green, and the corrected origin/main framing — then wait for its
  verdict.

Traps (with dates):
- 2026-09-30: the pricing-button click pattern in the shipped GA4 code never
  matched the actual button hrefs (`/checkout?plan=...` since `b4a479e`), so
  `begin_checkout` silently never fired on `origin/main` — check any future
  click-tracking regex against the *current* href, not the comment above it.
- 2026-09-30: no `claude-in-chrome` and no `wrangler` in a worker session —
  don't assume either is available; a jsdom-based harness reading local files
  directly (no dev server) is the fallback used here.
- 2026-09-30: analytics helper calls must be guarded/try-catched on every
  page that has its own logic to protect (checkout, welcome) — an ad blocker
  or network error must never be able to break checkout or hide the buyer's
  email. Don't add a new `LeskoAnalytics.*` call anywhere without checking
  the stub-guard above it is still in place first.
- 2026-09-30: in the jsdom harness, a check that a page "still works" when a
  script is blocked must simulate per-`<script>`-tag error isolation (catch
  each block's error separately), not let one block's throw abort the whole
  page load — otherwise the test crashes instead of failing the right check.
- 2026-09-30: a "block this script" test helper that matches on a literal
  filename gives a false green against any commit that used a different name
  for the same file (e.g. this repo's own pre-rename history) — it silently
  loads the real file instead of blocking it. Match on every name the file
  has ever had, not just its current one, whenever the harness might be
  pointed at an older commit.
