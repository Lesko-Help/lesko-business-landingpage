# page
Status: as-built 2026-09-30
Kind: app
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-09-30
Reads: nothing at runtime; the YouTube playlist is hard-coded in the file.
Writes: nothing of its own; sends the visitor to Recurly (checkout), Kit (newsletter form) and YouTube (embed).

## Overview

*What it is for:* sell LeskoHelp Pro to business owners and hand the buyer to Recurly's hosted checkout.
*What it owns:* `index.html`, `llms.txt`, `sitemap.xml`, `robots.txt`, `assets/`, the icons.
*What it depends on:* the three Recurly plans `business-monthly` / `business-half-year` / `business-yearly` existing at the prices the page shows.
*Public entry points:* `GET /` on leskobusiness.com; the three checkout links; the `#pricing` and `#guarantee` anchors.
*Not in scope:* the checkout itself, provisioning, any email, the ClickFunnels pages on leskohelp.com.
*Personal data:* the newsletter form posts the visitor's email straight to Kit; the page stores nothing. With GA4 on (PR #4), EU/EEA/UK/CH visitors get no analytics cookies.

Who: a business owner Matthew sent here · Where: web, one static HTML file

## Screens

### The page (`/`)

- What it shows: hero, the roadmap, stories, the guarantee band
  (`id="guarantee"`), the PRICING section (`id="pricing"`) with three plan
  cards, FAQ, "Meet Matthew" YouTube playlist, newsletter box, footer.
- Reads / Writes: none at runtime. The three plan buttons and the sticky bar
  link to `https://leskohelp.recurly.com/subscribe/<plan>`; the newsletter
  form posts to a Kit form.
- Error view: none — a static file. A wrong price is the failure mode: the
  price on a card is typed by hand and must equal the Recurly plan's
  (`GET https://v3.recurly.com/plans/code-<plan>`, header
  `Accept: application/vnd.recurly.v2021-02-25+json`, key in Secret Manager
  `recurly-api-key`, project lesko-486515). The HTML comment above the
  PRICING section says so.

## Functions

The page has no functions of its own beyond the inline scripts (reveal on
scroll, FAQ toggles, the sticky bar, the YouTube carousel). The one that
matters for money is the GA4 block from PR #4 (merged 2026-09-30):

### GA4 tag (inline `<script>` at the end of `<body>`)

*Signature:* `var GA4_MEASUREMENT_ID = ''` — empty means off.

*What it does:*
- R1: when `GA4_MEASUREMENT_ID` is empty, it returns before loading anything — no request to Google, no cookie.
- R2: when set, it loads gtag.js and sends `page_view`; visitors whose region is in `CONSENT_REQUIRED_REGIONS` (EU/EEA/UK/CH) get consent `denied` and therefore no analytics cookie.
- R3: a click on a link whose href matches `leskohelp.recurly.com/subscribe/<plan>` sends `begin_checkout` with `currency: USD`, `value` from `PLAN_PRICES_USD[plan]`, `items[0].item_id = plan`, plus `button_text` and `button_section`.
- R4: a click on `href="#pricing"` sends `join_button_click`; a submit of a form whose action contains `app.kit.com/forms/` sends `generate_lead` with `form_name: newsletter`.

*Examples:* click "Let's find my money →" on the yearly card -> `begin_checkout {value: 149.95, items: [{item_id: 'business-yearly'}], button_section: 'pricing'}`.

*Inputs:* the three constants at the top of the block; the DOM.

*Outputs:* gtag events; nothing stored on the page.

*Errors:* none surfaced to the visitor; with a wrong id Google silently drops the hits — check Realtime in the GA4 property after landing.

*Test:* tested by hand in real Chrome on 2026-09-29 with the id empty (no request to googletagmanager.com) and with a fake id (requests fire, `begin_checkout` carries the right plan) — no automated test yet; the first worktree touching this writes one (e.g. a jsdom script that loads `index.html`, clicks a plan link and asserts the `dataLayer` push), red first against `origin/main`.

## Decisions

- 2026-09-29: buttons go to Recurly's hosted pages, not ClickFunnels (Martin, "route A, deploy in an hour"). Why: the CF page for the monthly plan charged the yearly price, and the hosted pages needed no code.
- 2026-09-29: collect the VAT number and print it on the invoice, do not charge VAT (Martin). Why: EU business buyers need it on the invoice; plans stay tax-exempt. Lives in Recurly admin, not here.
- 2026-09-29: GA4 tag off until a property exists; no consent banner, EU visitors simply get no analytics cookie. Why: no property yet, and a banner on a sales page costs conversions.
- 2026-09-29: the YouTube section shows a fixed playlist of six business-grant videos instead of the channel's latest (Giulia). Why: the latest videos were not about business grants.

<!-- spec:template -->
