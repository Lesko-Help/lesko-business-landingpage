# page
Status: as-built 2026-10-06
Kind: app
Summary: `index.html` + `checkout.html` + `welcome.html` (+ `llms.txt`, `sitemap.xml`): the sales page, our one-step checkout and the thank-you page
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-10-27
Reads: `/api/config` (checkout only); nothing else at runtime — the YouTube playlist is hard-coded.
Writes: `/api/subscribe` (checkout); the buyer's email, company and plan in the browser's `localStorage` key `leskoCheckout`; the newsletter email straight to Kit.

## Overview

*What it is for:* sell LeskoHelp Pro to business owners, take their card on our own `/checkout`, and tell them on `/welcome` which email to sign in with.
*What it owns:* `index.html`, `checkout.html`, `welcome.html`, `assets/` (including `assets/flow.css`, the checkout and welcome styles), `llms.txt`, `sitemap.xml`, `robots.txt`, the icons.
*What it depends on:* the `worker` module's `/api/config` and `/api/subscribe`; Recurly.js v4 from `js.recurly.com`; the three Recurly plans at the prices the pages show.
*Public entry points:* `GET /`, `GET /checkout?plan=monthly|half-year|yearly` (once B5 lands: a 302 to the ClickFunnels page for that plan), `GET /welcome?email=…&plan=…`; the `#pricing`, `#guarantee` and `#faq` anchors.
*Not in scope:* the purchase itself (`worker`), provisioning and emails (lesko-provisioning), the ClickFunnels pages themselves — on leskohelp.com and, once B1 is built, on `checkout.leskobusiness.com` (built in the ClickFunnels dashboard; only the links to them are ours) — Recurly's hosted pages.
*Personal data:* the checkout sends name, email, optional company and address to Recurly and keeps email, company and plan in `localStorage` on the buyer's device (welcome reads it for 24 h). The email is in the `/welcome` URL. The newsletter form posts the email to Kit. With GA4 on, every visitor (EU included) gets an analytics cookie; there is no consent banner.

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

### Where the buttons go next: ClickFunnels on `checkout.leskobusiness.com` *(proposed 2026-10-27, worktree `cf-checkout`; not built)*

Martin's goal (2026-10-27): "we've added lesko.business.com to clickfunnels,
now we want to lead the traffic this way". Input: a visitor on
leskobusiness.com who clicks a plan. Output today: our own `/checkout`.
Output after this: a ClickFunnels order page for that plan on our own
subdomain, which charges the same Recurly plan, then back to our `/welcome`.

    buyer on / → https://checkout.leskobusiness.com/<plan>   (ClickFunnels page)
      card:   Recurly.js card form → Recurly purchase on business-cf-<plan>, origin token_api
      PayPal: our pasted PayPal button (B1a) → a PayPal subscription on Lesko's own plan
      → https://leskobusiness.com/welcome?plan=business-<plan>
      (then lesko-provisioning, unchanged: the recurly rail or the paypal rail)

What is there today (measured 2026-10-27): `checkout.leskobusiness.com` is
proxied through our Cloudflare zone to ClickFunnels, and **every path answers
302 to `//www.clickfunnels.com?aff_sub=domain_redirect`** — the domain is
connected, no funnel serves on it. The apex and `www` stay on our Worker.
(`pay.leskobusiness.com` is a GoDaddy Payments pay-link host, not
ClickFunnels, and not part of this.)

- B1 — the pages, built in the ClickFunnels dashboard, not in this repo
  (the `clickfunnels-opzichter` session, with Martin's yes at the click): a
  **new funnel** on `checkout.leskobusiness.com` holding a **copy** of the
  three order pages of funnel 5978951, at the paths `/monthly`, `/half-year`
  and `/yearly` — the same words as our `?plan=` values, so a path names its
  plan. Each copy keeps its product bound to the same Recurly plan and price
  as its original: monthly `business-monthly` $29.95 (original page 63160420,
  product 4923809), half-year `business-half-year` $89.95 (63160421, 4923810),
  yearly `business-yearly` $149.95 (63160422, 4923811). **Funnel 5978951
  itself is not moved**: a ClickFunnels Classic funnel serves on one domain,
  and the live leskohelp.com sales page `/home-2` (page 64064278) links to
  `www.leskohelp.com/lesko-help-*-b` by absolute URL, twice each — moving the
  funnel would break its six buy buttons. The domain's root `/` sends a
  visitor to `https://leskobusiness.com/`, not to clickfunnels.com.
  **What was built (read live 2026-10-27, paced, cf-cache-status DYNAMIC):**
  funnel 13711137 with pages 64133517 (monthly), 64133609 (half-year) and
  64133610 (yearly), products 5138523/5138524/5138525, bound to the Recurly
  plans `business-cf-monthly` $29.95, `business-cf-half-year` $89.95 and
  `business-cf-yearly` $149.95. Those plan codes are **accepted** in place of
  `business-<plan>`: they are active Recurly plans with the same price and
  interval (`clickfunnels` repo, `data/recurly_plans.json`), and
  lesko-provisioning picks the MN plan by rail (`ref_rail_plans`), not by
  plan code. Still open from B1 at that date: the pages sit at the slugs
  `/optin1793010582809`, `/business_6_montly_89-951793018300131` and
  `/business_yearly_149951793018490642`; `/monthly`, `/half-year`, `/yearly`
  and `/` all answer 302 to clickfunnels.com. The paths are renamed in the
  CF dashboard rather than linked as they are, because the links (B3), the
  retire redirect (B5) and the PayPal snippet (B1a) all name the plan by its
  path.
- B1a — **PayPal on the CF pages** (DECISION BY MARTIN 2026-10-27, "paypal
  should be included on the pages hosted by clickfunnels"). Input: a buyer on
  one of the three copies who clicks the PayPal button. Output: a live
  subscription in **Lesko's own PayPal merchant account** on that plan's own
  id — `monthly` `P-7R176589BE0160805NLJVCFI` $29.95, `half-year`
  `P-2GV64945HR320740CNLIP2HY` $89.95, `yearly` `P-8M862053KT491162FNLJVCFI`
  $149.95, the same ids `/checkout` has used since 2026-10-17 (`wallets` P2) —
  then the buyer on `/welcome?plan=business-<plan>`, as B2. Access comes from
  lesko-provisioning's `paypal` rail off PayPal's own webhook, which already
  handles these three plans; nothing changes there.
  How: **never ClickFunnels' built-in PayPal integration.** It bills CF's own
  merchant plans — the ids copied from a CF page on 2026-10-17 billed $19.95
  for monthly, had no half-year plan, and answered 404 for our credentials
  (`wallets`, 2026-10-17). Instead one snippet,
  `clickfunnels/paypal-button.html` in this repo, is pasted unchanged into a
  Custom JS/HTML element on each of the three copies by the
  `clickfunnels-opzichter` session, with Martin's yes at the click. One
  snippet for all three pages, so no copy can carry the wrong id: it reads
  its plan from the page's own path (`/monthly`, `/half-year`, `/yearly`) and
  looks the id up in a map at its top. Each copy's **template PayPal button
  is removed**: the copies came with a "Pay with PayPal" button and custom JS
  (`#tmp_button-37282`, a `Paypal` product option) that sends the buyer to
  `www.free.lesko.com/monthly-paypal1711925300051`, which answers 302
  (cf-cache-status MISS) to `/lesko-help-aff` — the consumer ClickBank $3
  trial lander, `cbitems=LESKO-TRIAL-3-2995` (MISS on a fresh path). Found on
  all three pages, the yearly one included, on 2026-10-27. The snippet copies `wallet-paypal.js`'s
  behaviour, not its code (that file depends on `LeskoCheckout`, which a CF
  page does not have):
  - PP1: an unknown path, an empty client id or a missing container → no
    button and no PayPal script fetched.
  - PP2: it loads PayPal's JS SDK once with our public client id (the
    constant `PAYPAL_CLIENT_ID` in `assets/wallet-paypal.js`, copied as is)
    and `vault=true&intent=subscription&currency=USD&components=buttons&disable-funding=card`
    — card funding off, because the CF card form is on the same page.
  - PP3: `createSubscription` returns `actions.subscription.create({ plan_id })`
    for this page's plan, and nothing else.
  - PP4: `onApprove` sends the buyer to
    `https://leskobusiness.com/welcome?plan=business-<plan>`, adding
    `&email=` with PayPal's `subscriber.email_address` (lower-cased) only
    when `actions.subscription.get()` gives it within 5 s; a lookup that
    fails, throws or hangs still navigates, without the email. The money is
    already taken at that point, so nothing may stop the navigation.
  - PP5: failures are shown in the snippet's own message line, never in
    `window.alert`; a failure after approval says "we could not confirm your
    PayPal payment — if you were charged, contact support before trying
    again". A plain cancel shows nothing.
  - PP6: the client *secret* never appears; the client id is a public browser
    identifier.
  The file is served by nobody: `clickfunnels/` goes into `.assetsignore`.
  *Test:* `scripts/test-cf-paypal-button.mjs` — jsdom loads the snippet at
  each of the three paths with a stub `paypal` global, and checks PP1–PP5:
  the exact plan id per path, no script for `/` or `/other`, the SDK URL's
  query and client id (equal to `wallet-paypal.js`'s), the `/welcome` URL
  with and without an email, and the hang/throw cases still navigating. Red
  first against a snippet with the monthly and yearly ids swapped.
- B2 — after a paid order each copy sends the buyer to
  `https://leskobusiness.com/welcome?plan=business-<plan>`. No email in that
  URL: `/welcome` already works on `plan` alone (`purchase` fires, the email
  box shows "the email you entered on the payment page"). If ClickFunnels can
  put the buyer's email in the URL as `email=`, it may; `/welcome` strips it
  before GA4 (R6).
- B3 — the links (the worker's change, `index.html`, `llms.txt`): the three
  "Add To Cart!" buttons, the final call-to-action, the three schema.org
  offer `url`s in `<head>` and the three plan lines in `llms.txt` point at
  `https://checkout.leskobusiness.com/<plan>`. `sitemap.xml` lists only `/`
  and is not touched.
- B4 — analytics: `begin_checkout` keeps firing on every one of those four
  links with the right plan and price (R3 below, amended). The CF pages do
  not load `site-events.js`, so a buyer who goes there sends no
  `add_payment_info` (R5) and the PayPal button there sends none of the
  `wallet_*` events (`wallets` C7); the funnel in GA4 reads `begin_checkout`
  → `purchase` on `/welcome`, for card and PayPal buyers alike.
- B5 — `/checkout` is **retired** (DECISION BY MARTIN 2026-10-27, "Retire
  /checkout"; PayPal moves with the buyer to the CF copies, B1a). Input: any request for `/checkout`,
  `/checkout/` or `/checkout.html`, with or without `?plan=`. Output: **302**
  to `https://checkout.leskobusiness.com/<plan>`, where `<plan>` is the
  `?plan=` value when it is one of `monthly`, `half-year`, `yearly` (a leading
  `business-` stripped) and `monthly` otherwise — the same fallback
  `checkout.html` uses. How: `checkout.html` goes into `.assetsignore`, so the
  static files no longer answer `/checkout` and the request reaches
  `worker.js` (`worker` R5). 302, not 301: a browser keeps a 301 for good, and
  the way back must stay one landing. The file itself, `assets/flow.css`'s
  checkout styles and the wallet files stay in the repo, unserved or unused,
  until a real purchase has come through the CF route; deleting them is a
  later cleanup with its own brief. Why a redirect and not a 404: the old
  link is in `llms.txt` caches, AI answers and any bookmark, and a buyer
  holding it should still reach a page that takes their money.
- B5a — with the page gone nothing legitimate calls `/api/subscribe` or
  `/api/config`, so both answer **410** (`worker` R6) and never call Recurly.
  Why: `/api/subscribe` has no bot check and its key has full scope; left
  open behind a retired page it is a card-testing target that serves no
  buyer.
- B6 — landing order: the links (B3) and the retirement (B5, B5a) change
  only after the CF pages are proven on the live domain (B7 green), and they
  land together. Landed before that, every buyer reaches
  clickfunnels.com's own home page.
- B7 — the proof, `scripts/check-cf-checkout.sh`, run by hand (it is not on
  a schedule, so it needs no alert): for each plan, one request at a time,
  paced, with an honest User-Agent naming this repo and the script, it
  fetches `https://checkout.leskobusiness.com/<plan>` without following
  redirects and asserts on what only the right page has — the new page's own
  numeric id (the hidden input's `value`; the `page_id` meta tag is
  encrypted), `data-product-payment-gateway-plan-id="business-cf-<plan>"` and
  `data-product-amount` equal to the plan's price; and, for PayPal (B1a), our
  client id is on the page and the set of PayPal plan ids on it (`P-`
  followed by 24 capitals or digits) is **exactly** our three — any other
  `P-` id is a ClickFunnels-account PayPal plan and makes the page dead;
  and the page carries no **link** to free.lesko.com (`//free.lesko.com/` or
  `//www.free.lesko.com/`) — the old template PayPal button (B1a) sends a
  business buyer to the consumer $3 trial, and a page carrying it is dead.
  A link, not a mention: every copy also loads a tracking script whose
  comments and domain allow-list name `free.lesko.com` as bare text, and a
  check that failed on any mention could never go green (found 2026-10-27,
  on the saved live HTML of all three pages).
  Verdict per plan is live, dead or unknown: a 302, a wrong id, a wrong
  plan or a foreign or missing PayPal id is dead; 429, any 5xx, a
  timeout or a reset is unknown. Exit 0 only when all three are live. It is
  red today (all three 302 at their paths; at their slugs, no client id, none
  of our `P-` ids, and the `free.lesko.com` button). The three page ids are constants in the script,
  filled in from what B1 creates.

The prices are now typed in one more place: the three CF products. Change
one, change all — `index.html`, `checkout.html`, `assets/site-events.js`,
the Recurly plans, and the CF products.

### The checkout (`/checkout?plan=…`)

- What it shows: the chosen plan and its total (an unknown or missing `plan`
  falls back to `monthly`), then first and last name, email (echoed back
  under the field), optional business name, Recurly's card field, street,
  city, region, postal code, country, and a "Pay $… now" button. Which of
  the address fields are required depends on the country — see the
  billing-address rules below.
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

- Billing address *(as-built 2026-10-06)*: the **country select is
  what decides which address fields a buyer must fill in**, so a non-US buyer
  can finish the form. Street and city are required everywhere. The region
  field is required only for `US`, `CA` and `AU` (the three in the list whose
  gateways check it) and optional for the other 37; its label reads
  "State / Province / Region", and the US is not a special case in the markup,
  only in that list. The postal field is labelled "Postal code", carries no
  `inputmode="numeric"` (NL, GB, CA, PL postcodes contain letters) and is
  required everywhere except `AE`, `BS`, `JM`, `TT` and `GH`, which have no
  usable postcode. Recurly's own `required:` list is cut back to the fields
  that are needed in every country — `first_name`, `last_name`, `address1`,
  `city`, `country` — so the per-country part is ours alone and Recurly is
  never configured twice.
- A blocked Pay press always says something *(as-built 2026-10-06)*: when
  the form check fails, the red `#payMsg` box names the first missing field
  and the page scrolls to it. Before this the submit handler returned in
  silence, so a buyer whose only error was out of sight (the Pay button sits
  in the right-hand column, the address fields in section 2) saw a dead
  button and no reason — the most likely cause of Martin's failed Belgian
  attempt on 2026-10-05.
- Wallet buttons *(draft, not built)*: PayPal, Apple Pay and Google Pay are
  specified in `docs/specs/modules/wallets.md`, as a `#wallets` row above the
  card section plus one file per method. They are off by default and change no
  card behaviour; `checkout.html`'s only part in it is that row, one
  `<script src>` per method, and publishing the `window.LeskoCheckout` seam
  (wallets K1-K5).
- *Test:* `scripts/test-checkout-address.sh .` — jsdom loads the real
  `checkout.html`, stubs Recurly.js, and presses Pay: an empty form, then a
  US form filled in one field at a time, must each name the first missing
  field in `#payMsg` (never fail silently); a Belgian address with the region
  left blank must reach the card-token call, proving Pay was not blocked.
  It also checks the labels, the absent `inputmode`, the per-country
  required flags for DE/AE/BS/JM/TT/GH, and that Recurly's own `required:`
  list no longer names region or postal code. Proven red first against
  `35b2e3e`, the commit before the build: 17 of the checks fail there, among
  them the empty-form press saying nothing at all and the Belgian address
  never getting past the required `State`.

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
- R2: when set, `init()` loads gtag.js and sends `page_view`; one consent default applies to every visitor, with no `region` key: `analytics_storage` `granted`, `ad_storage`, `ad_user_data` and `ad_personalization` `denied`. No linker to `leskohelp.recurly.com` (removed: nothing links there any more).
- R3: `/`: a click on a link whose href has `/checkout…?plan=<plan>` — or, once B3 lands, `https://checkout.leskobusiness.com/<plan>` (the plan is the path) — sends `begin_checkout` with `currency: USD`, `value` from `planPriceUSD(plan)`, `items[0].item_id = plan`, plus `button_text` and `button_section`.
- R4: `/`: a click on `href="#pricing"` sends `join_button_click`; a submit of a form whose action contains `app.kit.com/forms/` sends `generate_lead` with `form_name: newsletter`.
- R5: `/checkout`: `page_view` carries `plan`; pressing Pay with a valid form sends `add_payment_info` (plan, price, USD) before Recurly is asked for a card token, so declines still count.
- R6: `/welcome`: `page_location` has `email`, `account_code` and `account` stripped, so the buyer's email never reaches Google; `purchase` (plan, price, USD; a `business-` prefix is stripped) fires once per tab (`sessionStorage` key `leskoPurchaseSent`).
- R7: if `site-events.js` is blocked or fails to load, the stand-in makes every call harmless: the checkout still shows the plan and can pay, the welcome page still shows the email.

*Examples:* click the yearly card's button -> `begin_checkout {value: 149.95, items: [{item_id: 'yearly'}], button_section: 'pricing'}`; open `/welcome?email=a@b.co&plan=business-monthly` -> `purchase {value: 29.95, items: [{item_id: 'monthly'}]}`, `page_location` without `email`.

*Inputs:* the constants at the top of `site-events.js` (id, `PLAN_PRICES_USD`); the DOM; the page URL.

*Outputs:* gtag events; `leskoPurchaseSent` in `sessionStorage` on `/welcome`.

*Errors:* none surfaced to the visitor; with a wrong id Google silently drops the hits — check Realtime in the GA4 property after filling in the id. `PLAN_PRICES_USD` is one more hand-typed copy of the prices (with `index.html`, `checkout.html` and Recurly).

*Test:* `scripts/test-ga4-events.sh .` — jsdom runs each page's scripts in order, patches `G-TEST` in memory only, fires the clicks and submits and reads `dataLayer` back: 34 checks, R1–R7 (three on R2: one consent default, no `region` key, analytics granted; red against the old two-default code), plus two on the file as shipped (id exactly `G-6K847LXFE7`; no page loads gtag.js itself). R1 is tested with the id forced to `''`, so it holds whatever id ships. Red first against `origin/main` (`begin_checkout` dead) and against round 1 (the 4 "file blocked" checks for R7). Since 2026-10-17 it also watches the PayPal wallet funnel events of `wallets` C7 arrive in `dataLayer` — `wallet_click`, `wallet_cancel` and `wallet_error`, plus `wallet_click_refused` asserted **absent** since 2026-10-23, when PayPal stopped refusing a click (`wallets` P6) with the plan, the USD price as a number and `payment_type: 'PayPal'`, and that none of them carries the buyer's email — checked here at the gtag end rather than at `LeskoAnalytics.track()`, so an event that is sent but never reaches Google fails too.

## Decisions

- 2026-09-29: buttons go to Recurly's hosted pages, not ClickFunnels (Martin, "route A, deploy in an hour"). Why: the CF page for the monthly plan charged the yearly price, and the hosted pages needed no code. Superseded 2026-09-30.
- 2026-09-29: collect the VAT number and print it on the invoice, do not charge VAT (Martin). Why: EU business buyers need it on the invoice; plans stay tax-exempt. Lives in Recurly admin; the branded `/checkout` has no VAT field yet.
- 2026-09-29: GA4 tag off until a property exists; no consent banner, EU visitors simply get no analytics cookie. Why: no property yet, and a banner on a sales page costs conversions.
- 2026-09-29: the YouTube section shows a fixed playlist of six business-grant videos instead of the channel's latest (Giulia). Why: the latest videos were not about business grants.
- 2026-09-30 (`d3b2562`): buttons go to our own one-step `/checkout` (Martin: "step over to the branded pages as fast as possible, fix the issues one by one later"). Why: a branded page instead of Recurly's hosted one. The route is not yet proven by a real purchase.
- 2026-09-30 (`815fbf2`): one shared GA4 file for all three pages, named `site-events.js` so ad blockers are less likely to drop it, with a no-op stand-in on each page. Why: one id and one consent rule for the whole funnel, and a blocked analytics file must never stop a buyer from paying.
- 2026-09-30 (`682b52f`): GA4 switched on with `G-6K847LXFE7`, the leskobusiness.com web stream of Martin's new property, set only in `site-events.js`; no Google snippet, no GTM (Martin). Why: the funnel events need somewhere to go; one id in one file keeps the consent and email-stripping rules in force.
- 2026-09-30: `checkout.html`, `welcome.html` and `assets/flow.css` are part of this module, not a module of their own. Why: they are static pages deployed and edited the same way; the Worker side is `worker`.
- 2026-10-01 (landed 2026-10-02, `68b9961`): the EU/EEA/UK/CH consent rule is dropped, still no banner — every visitor gets `analytics_storage` granted, ads stay denied (Martin, told it goes against the EU ePrivacy consent rule). Why: GA4 counted no EU visits at all, including Martin's own test visits, so the funnel could not be read. Replaces the 2026-09-29 line's "EU visitors simply get no analytics cookie".
- 2026-10-06: the checkout accepts a non-US billing address; which fields are required follows the chosen country (Martin). Why: the form demanded a US "State" and a numeric "ZIP", so a European buyer could not submit it at all — and no purchase has ever come through `/checkout`. This changes our form only; whether the gateway behind Recurly (Authorize.net, a US merchant account) actually accepts a European card is a separate, unproven question, and this change is also the cheapest way to find out.
- 2026-10-09 (draft, not agreed): PayPal, Apple Pay and Google Pay get their
  own module spec (`wallets.md`) instead of more text here. Why: this spec
  records a page that exists, and not one of the three wallets can run until
  the gateway behind Recurly changes.

- 2026-10-27 (spec agreed in part, worktree `cf-checkout`, not built): the buttons go to ClickFunnels order pages on our own subdomain `checkout.leskobusiness.com/<plan>`, a copy of funnel 5978951's three `-b` pages in a funnel of its own (B1–B7). Why: Martin's goal, "we've added lesko.business.com to clickfunnels, now we want to lead the traffic this way". Why a copy and not a move: `/home-2` on leskohelp.com links to the originals and a Classic funnel serves on one domain. Why the links wait for a live check: the domain answers every path with clickfunnels.com's own home page until B1 is built.
- 2026-10-27: **DECISION BY MARTIN: retire `/checkout`** ("Retire /checkout", picked over keeping it live but unlinked, told at the time that the CF copies are card-only). `/checkout` becomes a 302 to the CF page for its plan, `/api/subscribe` and `/api/config` answer 410 (B5, B5a). Why the code stays for now: going back is one landing, and nothing is deleted before a real purchase has come through the CF route.
- 2026-10-27: **DECISION BY MARTIN: PayPal is included on the CF pages** ("paypal should be included on the pages hosted by clickfunnels", answering a report that said PayPal would leave the buyer's path). One snippet from this repo, `clickfunnels/paypal-button.html`, pasted on all three copies (B1a), billing Lesko's own three PayPal plans. Why a snippet and not CF's PayPal setting: CF's own PayPal plans belong to CF's merchant account and bill the wrong price (the 2026-10-17 trap). Why it lives here: it carries our plan ids and client id, so it is reviewed, tested and versioned like the rest of the checkout, and B7 proves the live paste matches.

<!-- spec:template -->
