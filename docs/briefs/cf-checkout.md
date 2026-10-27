---
# Pairing block: what this worktree is paired to. Read by control-window.sh
# (cw_pairing) for the overview. wt-new.sh fills repo, and module and spec
# when WT_MODULE was given; everything else is yours or the interview's.
# Never guess a value from a branch, folder or repo name: leave `<fill in`.
# deploy: and data: are the seat's to fill (wt-new.sh cannot know them) and
# wt-done.sh refuses to land while either is still `<fill in`:
#   deploy: yes|no  - does landing this branch need a deploy step afterwards
#   data: none|additive|expand|contract  - none = ships no ddl/ or seed script;
#     additive = only a change the serving revision survives; expand and
#     contract = the two landings of a destructive change.
client: <fill in>
repo: landing
rails: recurly (card, through ClickFunnels' Recurly.js order pages)
module: page
spec: docs/specs/modules/page.md
folder: <fill in>
deploy: no
data: none
---

# Brief: cf-checkout

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

so we`ve added lesko.business.com to clickfunnels, now we want to lead the traffic this ay

## Done when

This branch is the architect's: it writes the spec, not the code. It is done
when `docs/specs/modules/page.md` carries the cf-checkout section (B1–B7, R3
amended, the decision line) and Martin's open questions are written under
Spec proposals below.

The worker it starts is done when, in this order:

1. `scripts/check-cf-checkout.sh` (new) passes against the live site: for each
   of the three plans it fetches `https://checkout.leskobusiness.com/<plan>`
   once, paced, with an honest User-Agent, and asserts on what only the right
   page has — the CF page id, `data-product-payment-gateway-plan-id` =
   `business-<plan>`, `data-product-amount` = the plan's price, our PayPal
   client id, and exactly our three `P-` plan ids (B1a). **Red today**
   (measured 2026-10-27: every path on that host is a 302 to
   `www.clickfunnels.com?aff_sub=domain_redirect`, the "no page assigned"
   answer). It goes green only after the ClickFunnels dashboard step (B1).
2. `scripts/test-ga4-events.sh .` extended: a click on each of the four
   checkout links in `index.html` (three cards + the final call-to-action)
   sends `begin_checkout` with the right plan and price when the links point at
   `checkout.leskobusiness.com/<plan>`. Red first against the current matcher
   (`index.html:3210` reads only `/checkout…?plan=`).
3. The links in `index.html`, the schema.org offers and `llms.txt` point at
   the CF pages (B3). `sitemap.xml` lists only `/` and is not touched.
4. `/checkout` retired (B5, B5a; `worker` R5, R6): a new vm test in the shape
   of `scripts/test-subscribe-wallet.js` drives `worker.js`'s `fetch()` with a
   `fetch` stub that fails if called — `/checkout?plan=half-year` -> 302 to
   `https://checkout.leskobusiness.com/half-year`, `?plan=business-yearly` ->
   `/yearly`, no or unknown plan -> `/monthly`, `/checkout/` and
   `/checkout.html` the same, POST `/api/subscribe` and GET `/api/config` ->
   410 with the stub untouched. Red first against today's `worker.js`.
   `checkout.html` is in `.assetsignore`. The existing suites (checkout, wallet,
   worker unit tests, ga4) stay green — they read the files, not the served
   site.
5. PayPal on the CF pages (B1a): `clickfunnels/paypal-button.html` (new), the
   one snippet pasted on all three copies, and `scripts/test-cf-paypal-button.mjs`
   (new) green for PP1–PP5 — red first against a copy with the monthly and
   yearly ids swapped. `clickfunnels/` is in `.assetsignore`. The paste itself
   is `clickfunnels-opzichter`'s (Q2); item 1 proves it on the live pages.

Spec: docs/specs/modules/page.md updated (this branch).

## May touch

Module `page`. This branch: `docs/specs/modules/page.md`, `docs/specs/INDEX.md`
(open questions), this brief. The worker's branch: `index.html` (the four
checkout hrefs, the three schema.org offer urls, the click matcher near line
3210 and its comment), `llms.txt`, `scripts/test-ga4-events.mjs`,
`scripts/check-cf-checkout.sh` (new), `worker.js` (R5, R6 in `fetch()` only —
`subscribe()` and the decline path untouched), `.assetsignore` (one line,
`checkout.html`), the new retire test. Not `checkout.html`, `welcome.html` or
the wallet files: retired means unserved, not deleted (B5). For B1a:
`clickfunnels/paypal-button.html` (new), `scripts/test-cf-paypal-button.mjs`
(new), and a second `.assetsignore` line, `clickfunnels/`.

## Deploy implied

This branch: none — `docs/` is in `.assetsignore`, nothing on the site changes.
The worker's branch: push to `main` (Workers Builds) — and it may land only
once `scripts/check-cf-checkout.sh` is green against the live CF pages, or every
buyer is sent to clickfunnels.com's own home page.

## Context

Goal as typed by Martin (2026-10-27): "so we've added lesko.business.com to
clickfunnels, now we want to lead the traffic this way". No werk.queue row id
in it, so this seat writes no queue state.

Measured 2026-10-27 (curl, honest UA, paced 4–5 s, probe paths never
requested before):
- `checkout.leskobusiness.com` is proxied through our Cloudflare zone to
  ClickFunnels (Rails headers `x-runtime`, `x-request-id`). Every path —
  `/`, `/lesko-help-monthly-b`, `/home-2`, a random probe — answers **302 to
  `//www.clickfunnels.com?aff_sub=domain_redirect`**: the domain is connected
  in ClickFunnels, but no funnel serves on it yet. That is what "added to
  clickfunnels" means today.
- `pay.leskobusiness.com` is **not** ClickFunnels: a GoDaddy Payments "Pay Link
  Not Found" 404. Unrelated to this task.
- The apex and `www` stay on our Worker.
- The three live CF order pages are on `www.leskohelp.com`, funnel id
  5978951, each charging exactly what it shows:
  `/lesko-help-monthly-b` page 63160420, product 4923809, plan
  `business-monthly`, $29.95; `/lesko-help-half-yearly-b` page 63160421,
  product 4923810, `business-half-year`, $89.95; `/lesko-help-yearly-b` page
  63160422, product 4923811, `business-yearly`, $149.95. The numeric page id
  is in the `value` of a hidden input; the `page_id`/`funnel_id` meta tags are
  encrypted.
- **Trap (2026-10-27):** the live leskohelp.com sales page `/home-2` (page
  64064278, funnel 12542156) links to those three pages by absolute
  `https://www.leskohelp.com/lesko-help-*-b` URL, twice each. A ClickFunnels
  Classic funnel serves on one domain, so moving funnel 5978951 to
  `checkout.leskobusiness.com` would break `/home-2`'s six buy buttons. The new
  domain needs a **copy** of the three pages in a funnel of its own.
- The three `-b` pages are card-only: no PayPal SDK, no `P-` plan id. A buyer
  sent there has no PayPal button, unlike our `/checkout` (PayPal on since
  2026-10-17, `wallets` P1–P10) — so the copies need one added (B1a, Martin
  2026-10-27). CF's built-in PayPal is not an option: its plans are CF's
  merchant account's ($19.95 monthly, 404 for our credentials, 2026-10-17).
- The CF pages run Recurly.js against the same three plans, so a purchase
  arrives in Recurly as origin `token_api` — the same as our own `/checkout`
  (`worker.md` decision 2026-10-06) — and provisioning needs nothing.
- `/welcome` already works with `?plan=` alone and no email: `purchase` fires
  with the plan, the email box shows its generic text.
- ClickFunnels dashboard work is the `clickfunnels-opzichter` session's, with
  Martin's yes at the click (CLAUDE.md, corrected 2026-10-17).

Memory from the overseer: not received by the time of this commit.

## Spec proposals

This seat is the architect, so the spec change itself is on this branch
(`docs/specs/modules/page.md` B1–B7, R3 amended, decision 2026-10-27; INDEX
open question). What is still open, and who answers it:

- Q1 (Martin) — **closed 2026-10-27: "Retire /checkout"**, picked over
  keeping it live and unlinked, told the CF copies are card-only. Written into
  `page` B5/B5a, `worker` R5/R6, `wallets` and INDEX (`1540277`).
- Q2 (`clickfunnels-opzichter`, Martin's yes at the click): build B1 — the new
  funnel on `checkout.leskobusiness.com`, the three copies at `/monthly`,
  `/half-year`, `/yearly`, the root sent to leskobusiness.com — and B2, each
  copy's after-payment step to `/welcome?plan=business-<plan>`. Report back
  the three new numeric page ids (B7 asserts on them) and whether CF can put
  the buyer's email in that URL. Also B1a: paste
  `clickfunnels/paypal-button.html` (from `cf-links` once it is written)
  unchanged into a Custom JS/HTML element on each copy, and never switch on
  CF's own PayPal integration there.
- Q3 (Martin) — **closed 2026-10-27: PayPal is included on the CF pages**
  ("paypal should be included on the pages hosted by clickfunnels"), read as
  a correction of the report's "PayPal leaves the buyer's path". Written
  into `page` B1a, B4, B5, B7, `wallets`, INDEX (`b3bd700`).

## State

Replaced 2026-10-27. Seat: architect, oneshot. No werk.queue row id in the
Goal, so no queue state written.

Done:
- Spec: page B1–B7 (`3f98c42`), retire `/checkout` (`1540277`, Q1), PayPal
  on the CF pages (`b3bd700`, Q3: page B1a + B4/B5/B7, wallets, INDEX).
- Worker `cf-links` started (`WT_MODULE=page`), reads the spec with
  `git show cf-checkout:…`; told about B1a after `b3bd700`.

Next:
1. Re-report to Martin; wt-done.sh --check cf-checkout must exit 0.
2. Q2 to clickfunnels-opzichter (B1, B2, B1a paste) — via Martin.
3. Review `cf-links` when it reports: read-only, re-prove every guard red
   (ga4 matcher, retire test, PayPal snippet test, the live check), fill
   `Verdict:`. Never land.

Traps (with dates):
- 2026-10-27: funnel 5978951's -b pages are linked by /home-2 on
  www.leskohelp.com (absolute URLs, 6 buttons): copy, never move.
- 2026-10-27: checkout.leskobusiness.com answers every path 302 ->
  clickfunnels.com until a funnel serves there; landing links early sends
  every buyer away.
- 2026-10-27: pay.leskobusiness.com is GoDaddy Payments, not ClickFunnels.
- 2026-10-27: CF -b pages are card-only today; CF's own PayPal bills CF's
  merchant plans — PayPal goes on via our snippet only (B1a).
- 2026-10-27: begin_checkout matcher index.html:3210 reads only
  /checkout...?plan=.
