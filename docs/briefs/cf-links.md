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
client: Lesko
repo: landing
rails: recurly (card, through ClickFunnels' Recurly.js order pages)
module: page
spec: docs/specs/modules/page.md
folder: scripts/, index.html, llms.txt, worker.js, .assetsignore
deploy: yes
data: none
---

# Brief: cf-links

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

Build docs/specs/modules/page.md B3, B4, B5, B5a, B7 and docs/specs/modules/worker.md R5, R6 — the spec is NOT on main yet: read it with 'git show cf-checkout:docs/specs/modules/page.md' (and worker.md), and the done-when in 'git show cf-checkout:docs/briefs/cf-checkout.md' (Done when 1-4, May touch). In short: (1) scripts/check-cf-checkout.sh, a paced, honest-UA live check of https://checkout.leskobusiness.com/{monthly,half-year,yearly} asserting the CF page id, data-product-payment-gateway-plan-id=business-<plan> and data-product-amount; three verdicts live/dead/unknown; red today (every path 302s to clickfunnels.com); page ids are placeholders until the clickfunnels-opzichter session builds the funnel (B1). (2) index.html's four checkout hrefs, three schema.org offer urls and llms.txt's three lines -> https://checkout.leskobusiness.com/<plan>; the begin_checkout matcher near index.html:3210 recognises them; scripts/test-ga4-events.mjs proves it, red first. (3) Retire /checkout: checkout.html into .assetsignore; worker.js fetch(): /checkout, /checkout/, /checkout.html -> 302 to the CF page by plan (fallback monthly, business- prefix stripped); /api/subscribe and /api/config -> 410, checked before R1/R2, never reaching Recurly; a new vm test with a fetch stub that fails if called, red first. Delete nothing. One idea per commit. Do NOT land: this may reach main only after check-cf-checkout.sh is green against the live CF pages. Questions go to control.cf-checkout.

## Done when

The test or assertion that must go from red to green. Name it. If it does not
exist yet, writing it is the first task — and prove it goes red before trusting
it green.

One fixed extra line, always present, naming the module this task belongs to:
`Spec: docs/specs/modules/<module>.md updated` if the module's spec changed,
or `Spec: unchanged because <reason>` if it did not.

1. `scripts/check-cf-checkout.sh` (page B7) exists and is red today: all three plans dead (302 to clickfunnels.com). Its page ids are placeholders until B1 exists.
2. `scripts/test-ga4-events.sh .` gains a click on each of the four checkout links, expecting `begin_checkout` with plan and price for `https://checkout.leskobusiness.com/<plan>`. Red against today's matcher, green once the matcher (page B4) is changed.
3. `index.html` (four hrefs, three offer urls) and `llms.txt` (three lines) point at the CF pages (page B3).
4. A new vm test drives `worker.js` `fetch()` with a `fetch` stub that fails if called: `/checkout`, `/checkout/`, `/checkout.html` give 302 by plan (worker R5); `/api/subscribe` and `/api/config` give 410 (worker R6). Red against today's worker, green after. `checkout.html` is in `.assetsignore`.

Spec: unchanged because page B3-B7 and worker R5-R6 are already written on branch `cf-checkout` (the overseer's); this branch only builds them.


## May touch

Module `page` (plus `worker` R5, R6 in `fetch()` only). Files: `index.html` (four checkout hrefs, three offer urls, the begin_checkout matcher near line 3210 and its comment), `llms.txt`, `scripts/test-ga4-events.mjs`, `scripts/check-cf-checkout.sh` (new), `worker.js` (`fetch()` only; `subscribe()` and the decline path untouched), `.assetsignore` (one line, `checkout.html`), the new retire test. Not `checkout.html`, `welcome.html` or the wallet files: retired means unserved, not deleted.

## Deploy implied

Push to `main` (Workers Builds), by the overseer. NOT before `scripts/check-cf-checkout.sh` is green against the live CF pages (page B6), or every buyer reaches clickfunnels.com's home page.

## Context

Spec and parent brief are on branch `cf-checkout` only: `git show cf-checkout:docs/specs/modules/page.md`, `worker.md`, `docs/briefs/cf-checkout.md`. Questions go to `control.cf-checkout`.

Measured 2026-10-27 (from the parent brief): every path on `checkout.leskobusiness.com` is a 302 to `//www.clickfunnels.com?aff_sub=domain_redirect`. Original CF pages on leskohelp.com (funnel 5978951): monthly page 63160420 $29.95, half-year 63160421 $89.95, yearly 63160422 $149.95, plans `business-<plan>`. The page id is the `value` of a hidden input; the `page_id` meta tag is encrypted. The copies' ids do not exist yet (B1, `clickfunnels-opzichter`).

Memory message from the overseer: not received by the time of this commit.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done (all committed, HEAD after this commit; tree clean):
- b62318a brief; 938cbe5 scripts/check-cf-checkout.sh (red live, green on stand-in).
- 6d54a12 index.html 4 hrefs + 3 offer urls + llms.txt + begin_checkout matcher; test-ga4-events.mjs extended (red twice, then green).
- f17f303 worker.js R5 (302) and R6 (410), scripts/test-checkout-retired.js (red 32 checks, then green), checkout.html in .assetsignore.
- Scope change 2026-10-27 from control.cf-checkout (spec b3bd700, brief fedbe77 on branch cf-checkout; B1a, B4, B5, B7): ad5d09f clickfunnels/paypal-button.html + scripts/test-cf-paypal-button.mjs/.sh (red on swapped monthly/yearly ids, green) + `clickfunnels/` in .assetsignore; then the check script's PayPal assertions (client id present, P- ids exactly our three, ids read from assets/wallet-paypal.js).
- First report sent to landing-opzichter [d5498b] before the scope change.
In flight: nothing.
Next: report 31a9e8b to control.cf-checkout (reviewer) and landing-opzichter [d5498b], then wait; do not land. No werk.queue row in the Goal, so write no queue state.
Traps (with dates):
- 2026-10-27: the three CF page ids in check-cf-checkout.sh are placeholders (REPLACE_WITH_PAGE_ID_*) until B1 exists; data-product-amount format ("29.95") is assumed, unverified on a real page.
- 2026-10-27: scripts/test-subscribe-rate-limit.sh deleted in 31a9e8b at the reviewer's request (control.cf-checkout; worker.md says it goes with R6). The only deletion; subscribe() and the checkout files stay.
- 2026-10-27: do NOT land before check-cf-checkout.sh is green live (page B6).
- 2026-10-27: zsh does not word-split unquoted $var; use bash for loops over "a b c" strings.
- 2026-10-27: a `ListAgents` name can match several sessions; send to `landing-opzichter [d5498b]` (the one on this machine).
