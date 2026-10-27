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
   `business-<plan>`, `data-product-amount` = the plan's price. **Red today**
   (measured 2026-10-27: every path on that host is a 302 to
   `www.clickfunnels.com?aff_sub=domain_redirect`, the "no page assigned"
   answer). It goes green only after the ClickFunnels dashboard step (B1).
2. `scripts/test-ga4-events.sh .` extended: a click on each of the four
   checkout links in `index.html` (three cards + the final call-to-action)
   sends `begin_checkout` with the right plan and price when the links point at
   `checkout.leskobusiness.com/<plan>`. Red first against the current matcher
   (`index.html:3210` reads only `/checkout…?plan=`).
3. The links in `index.html`, the schema.org offers, `llms.txt` and
   `sitemap.xml` point at the CF pages (B3).

Spec: docs/specs/modules/page.md updated (this branch).

## May touch

Module `page`. This branch: `docs/specs/modules/page.md`, `docs/specs/INDEX.md`
(open questions), this brief. The worker's branch: `index.html` (the four
checkout hrefs, the three schema.org offer urls, the click matcher near line
3210 and its comment), `llms.txt`, `sitemap.xml`, `scripts/test-ga4-events.mjs`,
`scripts/check-cf-checkout.sh` (new). Not `checkout.html`, `welcome.html`,
`worker.js` or the wallet files — `/checkout` stays as it is (B5).

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
  2026-10-17, `wallets` P1–P10).
- The CF pages run Recurly.js against the same three plans, so a purchase
  arrives in Recurly as origin `token_api` — the same as our own `/checkout`
  (`worker.md` decision 2026-10-06) — and provisioning needs nothing.
- `/welcome` already works with `?plan=` alone and no email: `purchase` fires
  with the plan, the email box shows its generic text.
- ClickFunnels dashboard work is the `clickfunnels-opzichter` session's, with
  Martin's yes at the click (CLAUDE.md, corrected 2026-10-17).

Memory from the overseer: not received by the time of this commit.

## Spec proposals

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
