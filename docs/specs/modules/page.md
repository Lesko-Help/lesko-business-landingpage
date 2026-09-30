# page
Status: as-built 2026-09-30
Kind: app
Summary: `index.html` + `checkout.html` + `welcome.html` (+ `llms.txt`, `sitemap.xml`): the sales page, our one-step checkout and the thank-you page
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-09-30
Reads: `/api/config` (checkout only); nothing else at runtime — the YouTube playlist is hard-coded.
Writes: `/api/subscribe` (checkout); the buyer's email, company and plan in the browser's `localStorage` key `leskoCheckout`; the newsletter email straight to Kit.

## Overview

*What it is for:* sell LeskoHelp Pro to business owners, take their card on our own `/checkout`, and tell them on `/welcome` which email to sign in with.
*What it owns:* `index.html`, `checkout.html`, `welcome.html`, `assets/` (including `assets/flow.css`, the checkout and welcome styles), `llms.txt`, `sitemap.xml`, `robots.txt`, the icons.
*What it depends on:* the `worker` module's `/api/config` and `/api/subscribe`; Recurly.js v4 from `js.recurly.com`; the three Recurly plans at the prices the pages show.
*Public entry points:* `GET /`, `GET /checkout?plan=monthly|half-year|yearly`, `GET /welcome?email=…&plan=…`; the `#pricing`, `#guarantee` and `#faq` anchors.
*Not in scope:* the purchase itself (`worker`), provisioning and emails (lesko-provisioning), the ClickFunnels pages on leskohelp.com, Recurly's hosted pages.
*Personal data:* the checkout sends name, email, optional company and address to Recurly and keeps email, company and plan in `localStorage` on the buyer's device (welcome reads it for 24 h). The email is in the `/welcome` URL. The newsletter form posts the email to Kit. With GA4 on, EU/EEA/UK/CH visitors get no analytics cookies.

Who: a business owner Matthew sent here · Where: web, three static HTML files

## Screens

### The sales page (`/`)

- What it shows: hero, the roadmap, stories, the guarantee band
  (`id="guarantee"`), the PRICING section (`id="pricing"`) with three plan
  cards, FAQ, "Meet Matthew" YouTube playlist, newsletter box, footer.
- Reads / Writes: none at runtime. The three "Add To Cart!" buttons link to
  `/checkout?plan=<monthly|half-year|yearly>`, the final call-to-action
  ("Join the community — I want my share") to `/checkout?plan=monthly`;
  the nav and hero buttons scroll to `#pricing`; the schema.org offers in `<head>`, `llms.txt`
  and `sitemap.xml` carry the same links. The newsletter form posts to Kit.
- Error view: none — a static file. A wrong price is the failure mode: the
  price on a card is typed by hand in `index.html` and again in `PLANS` in
  `checkout.html`, and both must equal the Recurly plan's
  (`GET https://v3.recurly.com/plans/code-<plan>`, header
  `Accept: application/vnd.recurly.v2021-02-25+json`, key in Secret Manager
  `recurly-api-key`, project lesko-486515). The HTML comment above the
  PRICING section says so *(as-built: that comment still names the old
  `leskohelp.recurly.com/subscribe/<plan code>` links; Giulia's copy)*.

### The checkout (`/checkout?plan=…`)

- What it shows: the chosen plan and its total (an unknown or missing `plan`
  falls back to `monthly`), then first and last name, email (echoed back
  under the field), optional business name, Recurly's card field, street,
  city, state, ZIP, country, and a "Pay $… now" button.
- Reads / Writes: `GET /api/config` for the Recurly public key; Recurly.js
  turns the card into a token; `POST /api/subscribe` with plan, token, names,
  email and company. On `ok` it saves `{email, company, plan, t}` in
  `localStorage` and goes to `/welcome?email=…&plan=…`. When the answer
  carries `three_d_secure_action_token_id` it opens Recurly's bank check and
  posts again with the result token.
- Error view: a red box (`#payMsg`) with the `message` from `/api/subscribe`
  (decline reason, rate limit, validation), or Recurly.js's own card-field
  error, or "The payment did not go through…" when there is none; a failed
  bank check shows "The bank check did not go through…". *(as-built: if
  `/api/config` fails, the card field silently never appears.)*

### The thank-you page (`/welcome?email=…&plan=…`)

- What it shows: "Thank you. Your payment went through.", the email to sign
  in with (from `email`, `account_code` or `account` in the URL, else from
  `localStorage` if under 24 h old), the plan line, a "Go to the community"
  button to `lesko-help-2.mn.co`, and a mailto to support@lesko.help for
  "no email after 15 minutes".
- Reads / Writes: the URL and `localStorage` only. It also serves buyers
  from Recurly's hosted pages, whose return URL passes
  `email={{account_code}}&plan={{plan_code}}`, so it accepts `business-*`
  plan codes too.
- Error view: no usable email -> the email box is styled "unknown" and the
  generic note stays; nothing breaks.

## Functions

The pages have no functions of their own beyond the inline scripts (reveal
on scroll, FAQ toggles, the sticky bar, the YouTube carousel, the checkout
and welcome scripts described under Screens). The one that matters for
money is GA4, shared by all three pages since `ga4-all-pages` (landed
2026-09-30, `815fbf2`):

### GA4 (`assets/site-events.js`, used by `index.html`, `checkout.html`, `welcome.html`)

*Signature:* `window.LeskoAnalytics = { init(extraConfig), track(name, params), isOn(), planPriceUSD(plan) }`; `var GA4_MEASUREMENT_ID = ''` at the top of the file — empty means off. Each page loads the file, then a no-op stand-in `window.LeskoAnalytics = window.LeskoAnalytics || {…}`; the page's own click and submit handlers call `track()`, never `gtag` directly.

*What it does:*
- R1: while `GA4_MEASUREMENT_ID` is empty, `init()` returns `false` and `track()` does nothing — no request to Google, no cookie, nothing in `dataLayer`, on any page.
- R2: when set, `init()` loads gtag.js and sends `page_view`; visitors whose region is in `CONSENT_REQUIRED_REGIONS` (EU/EEA/UK/CH) get consent `denied` and therefore no analytics cookie. No linker to `leskohelp.recurly.com` (removed: nothing links there any more).
- R3: `/`: a click on a link whose href has `/checkout…?plan=<plan>` sends `begin_checkout` with `currency: USD`, `value` from `planPriceUSD(plan)`, `items[0].item_id = plan`, plus `button_text` and `button_section`.
- R4: `/`: a click on `href="#pricing"` sends `join_button_click`; a submit of a form whose action contains `app.kit.com/forms/` sends `generate_lead` with `form_name: newsletter`.
- R5: `/checkout`: `page_view` carries `plan`; pressing Pay with a valid form sends `add_payment_info` (plan, price, USD) before Recurly is asked for a card token, so declines still count.
- R6: `/welcome`: `page_location` has `email`, `account_code` and `account` stripped, so the buyer's email never reaches Google; `purchase` (plan, price, USD; a `business-` prefix is stripped) fires once per tab (`sessionStorage` key `leskoPurchaseSent`).
- R7: if `site-events.js` is blocked or fails to load, the stand-in makes every call harmless: the checkout still shows the plan and can pay, the welcome page still shows the email.

*Examples:* click the yearly card's button -> `begin_checkout {value: 149.95, items: [{item_id: 'yearly'}], button_section: 'pricing'}`; open `/welcome?email=a@b.co&plan=business-monthly` -> `purchase {value: 29.95, items: [{item_id: 'monthly'}]}`, `page_location` without `email`.

*Inputs:* the constants at the top of `site-events.js` (id, `PLAN_PRICES_USD`, `CONSENT_REQUIRED_REGIONS`); the DOM; the page URL.

*Outputs:* gtag events; `leskoPurchaseSent` in `sessionStorage` on `/welcome`.

*Errors:* none surfaced to the visitor; with a wrong id Google silently drops the hits — check Realtime in the GA4 property after filling in the id. `PLAN_PRICES_USD` is one more hand-typed copy of the prices (with `index.html`, `checkout.html` and Recurly).

*Test:* `scripts/test-ga4-events.sh .` — jsdom runs each page's scripts in order, patches `G-TEST` in memory only, fires the clicks and submits and reads `dataLayer` back: 21 checks, R1–R7. Red first against `origin/main` (`begin_checkout` dead) and against round 1 (the 4 "file blocked" checks for R7).

## Decisions

- 2026-09-29: buttons go to Recurly's hosted pages, not ClickFunnels (Martin, "route A, deploy in an hour"). Why: the CF page for the monthly plan charged the yearly price, and the hosted pages needed no code. Superseded 2026-09-30.
- 2026-09-29: collect the VAT number and print it on the invoice, do not charge VAT (Martin). Why: EU business buyers need it on the invoice; plans stay tax-exempt. Lives in Recurly admin; the branded `/checkout` has no VAT field yet.
- 2026-09-29: GA4 tag off until a property exists; no consent banner, EU visitors simply get no analytics cookie. Why: no property yet, and a banner on a sales page costs conversions.
- 2026-09-29: the YouTube section shows a fixed playlist of six business-grant videos instead of the channel's latest (Giulia). Why: the latest videos were not about business grants.
- 2026-09-30 (`d3b2562`): buttons go to our own one-step `/checkout` (Martin: "step over to the branded pages as fast as possible, fix the issues one by one later"). Why: a branded page instead of Recurly's hosted one. The route is not yet proven by a real purchase.
- 2026-09-30 (`815fbf2`): one shared GA4 file for all three pages, named `site-events.js` so ad blockers are less likely to drop it, with a no-op stand-in on each page. Why: one id and one consent rule for the whole funnel, and a blocked analytics file must never stop a buyer from paying.
- 2026-09-30: `checkout.html`, `welcome.html` and `assets/flow.css` are part of this module, not a module of their own. Why: they are static pages deployed and edited the same way; the Worker side is `worker`.

<!-- spec:template -->
