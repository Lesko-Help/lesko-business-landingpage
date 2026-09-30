# Working in lesko-business-landingpage

The business landing page: **leskobusiness.com** (and www), static pages
(`index.html`, `checkout.html`, `welcome.html`, `assets/flow.css`) plus
`worker.js`, deployed as the Cloudflare Worker `lesko-business-landingpage`.
Its three buttons sell LeskoHelp Pro and send the buyer to our own
`/checkout`, which charges through Recurly (see "Where the buttons go"); from
there lesko-provisioning creates the Mighty Networks account. This repo owns
the page and the checkout page with its two Worker routes. Recurly itself,
provisioning and the checkout analytics belong to other repos (see
"Neighbours").

Repo created by Giulia (GitHub `GiuliaRobinMay`); she edits copy and images
through GitHub's upload button, straight on `main`. This overseer set-up
was made on 2026-09-30 from Martin's home session, after that session had
tested the checkout and found the page had no home on this machine.

## Roles: overseer and worktrees

Two kinds of Claude session run in this repo, and they do different things.
Which one you are is decided by your folder:

- **`~/Lesko/lesko-business-landingpage` = the overseer** (tmux window 1,
  always on `main`). It never writes code. It starts work with
  `wt-new.sh <name> "<goal>"`, which writes the goal into the brief
  `docs/briefs/<name>.md`; it reviews a finished worktree (`git add -N .` in
  the worktree, then `git diff origin/main...HEAD`), lands it with
  `wt-done.sh <name>`, and checks the live page afterwards. The only files
  it edits itself are environment files (CLAUDE.md, .gitignore, .werk.conf,
  .assetsignore, docs/briefs/TEMPLATE.md) and the agreed specs under
  `docs/specs/` — committed straight on `main` and pushed at once.
- **`.claude/worktrees/<name>` = a worktree session** (tmux window of the same
  name). Read `docs/briefs/<name>.md` before touching anything and fill it in
  from its goal. Work only on branch `<name>`. Never push to `main`, never
  `git worktree` anything — those are the overseer's. When done, report to
  the overseer and stop; it takes it from there.

Why: here **a push to `main` IS the deploy** (Cloudflare Workers Builds
watches `main`), so a branch pushed to `main` is production within a minute.
And two sessions in one folder overwrite each other's uncommitted work; a
worktree is a separate folder, so they cannot. Max three open at once
(`wt-new.sh` refuses a fourth).

The `wt-*.sh` scripts live in `~/.werk/` (on PATH, shared by every repo;
lazygit `n`/`o`/`D` call them). Nothing needs carrying into a fresh worktree
(`WT_CARRY` in `.werk.conf` is empty): no credentials, no data.

## Deploy

There is no deploy script. Cloudflare Workers Builds builds every push:
**`main` deploys to leskobusiness.com; a branch build always fails** (every
branch since 2026-09-25 — the red "Workers Builds" check on a PR is not a
verdict on the change). After a landing, confirm the page yourself:

    curl -s https://leskobusiness.com/ | cmp - <(git show origin/main:index.html)

On 2026-09-29 the page was byte-identical to `main` within a minute of the
push. A `lesko-business-landingpage.vercel.app` copy also exists, frozen at
commit `9a0a7d4` (2026-08-14), still selling a $1 trial whose checkout is
dead; removing that Vercel project is Martin's to do.

**Every file in the repo folder is served publicly** — `wrangler.jsonc` has
`assets.directory: "."`. `.assetsignore` is the only thing keeping
`CLAUDE.md`, `docs/`, `.werk.conf` and the rest off leskobusiness.com. Add
any new non-page file there, and check it 404s after landing.

## Where the buttons go, and why

Since 2026-09-30 (~13:20 UTC, commit `d3b2562`, DECISION BY MARTIN "step over
to the branded pages as fast as possible, fix the issues one by one later"):
the pricing buttons in `index.html` and the links in `llms.txt` go to our own
one-step checkout `/checkout?plan=<monthly|half-year|yearly>`:

    buyer on /checkout → name, email, card in Recurly.js's card field
      → worker.js /api/subscribe → Recurly POST /purchases
      → /welcome?email=…&plan=…   (then lesko-provisioning, as before)

| `?plan=` | Plan code in Recurly | Price | Created |
|---|---|---|---|
| `monthly` | `business-monthly` | $29.95 | 2026-09-24 |
| `half-year` | `business-half-year` | $89.95 | 2026-09-24 |
| `yearly` | `business-yearly` | $149.95 | 2026-09-24 |

The mapping lives in `PLAN_CODES` in `worker.js`. The prices in `index.html`
and `checkout.html` are typed by hand; the plans in Recurly are the truth.
Change one, change all — the HTML comment above the PRICING section says so.

`worker.js` routes: `/api/config` hands the browser the Recurly public key;
`/api/subscribe` makes the purchase with the private key; `/api/videos` is
no longer called (playlist hard-coded 2026-09-29). Both keys are **Worker
secrets** `RECURLY_PUBLIC_KEY` and `RECURLY_API_KEY` — secrets, not Text
variables, because `wrangler.jsonc` has no `vars`/`keep_vars` and every
Workers Builds deploy wipes dashboard Text variables. Without the private key
`/api/subscribe` answers 503 "Payments are not switched on yet". Martin keeps
a copy in his Mac keychain (service `leskobusiness`). The Worker lives in the
**Freelesko** Cloudflare account (`c75d24d09764e8db455eaf601ba3b377`); a
wrangler login sees two accounts, so set `CLOUDFLARE_ACCOUNT_ID` or wrangler
stops.

Known issues, accepted for the fast go-live and to be fixed one by one:
`/api/subscribe` has no bot or rate limit (card-testing risk); the Recurly
account code is the email the buyer types; the private key has full scope.

From 2026-09-29 (PR #3, `ac57980`) to the go-live the buttons went to
Recurly's hosted pages `https://leskohelp.recurly.com/subscribe/<plan>`;
those still work for anyone with the link. Before that the buttons went to
ClickFunnels pages
`www.leskohelp.com/business-{monthly,half-year,yearly}` with Recurly.js
embedded. Those pages still exist and still work for anyone with the link,
and **`/business-monthly` shows $29.95 but its CF product 5128001 is wired to
plan `business-yearly` ($149.95)** — Recurly asked Giulia's bank for $149.95
four times on 2026-09-29 (all declined). Fixing or unpublishing that is in
the ClickFunnels dashboard, which no Claude session can reach. The wiring is
visible without the dashboard: the `data-product-payment-gateway-plan-id`
attribute on the product input of the CF page.

For the hosted pages (the previous route), proven end to end 2026-09-29
16:46 UTC: hosted page → Recurly transaction
origin `hpp` → six webhooks → lesko-provisioning worker → MN member re-added,
21 seconds from payment to access. Recurly hosted pages carry no company or
VAT field (DECISION BY MARTIN 2026-09-29: collect the VAT number and print it
on the invoice, do NOT charge VAT — the switch is in Recurly admin › Hosted
Page Settings, Martin's or Giulia's to flip). On 2026-09-30 Martin set the
three business plans' return URL to
`https://leskobusiness.com/welcome?email={{account_code}}&plan={{plan_code}}`
with "Bypass Recurly Confirmation", so hosted-page buyers also land on
`/welcome`. The branded `/checkout` has no VAT field either; the route
through `/api/subscribe` is not yet proven end to end (first real test
purchase pending).

## Analytics

The page had none until PR #4 (`analytics/ga4-tag`, merged by Martin
2026-09-30 13:07 CEST): a GA4 block at the end of `index.html` that stays
off until `GA4_MEASUREMENT_ID` is filled in; events `begin_checkout` (plan + price), `join_button_click`,
`generate_lead`; EU/EEA/UK/CH visitors get no analytics cookies (no consent
banner). Martin owns no GA4 property yet (see memory
`project_lesko_ga4_analytics`); until he creates one the tag has nothing to
send to. Recurly's hosted pages need the same id in Hosted Page Settings;
whether that field accepts a `G-` id is unverified.

## Neighbours (other repos, other overseers)

- **lesko-provisioning** (`werk lesko`) — turns a Recurly subscription into
  MN access, keyed on the rail (`ref_rail_plans`), so new `business-*` plan
  codes need nothing there. Open there: returning and already-active payers
  get no email at all since 2026-08-17; the fix (enrol them into a branded
  Kit email) is specced there, not here.
- **kit-pipeline** (`werk kit`) — owns the Kit sequence 2910454 "(BTB)
  Welcome Back" drafted 2026-09-29 (unpublished until Martin approves the
  copy).
- **lesko-checkout** (`werk lesko-checkout`) — the checkout beacon and the
  checkout Dataform models. Hosted-page buyers arrive there as transaction
  origin `hpp`, already counted as checkout attempts; the beacon-based models
  simply see fewer rows. Buyers through the branded `/checkout` (since
  2026-09-30) are made by our Worker through Recurly's API, so their origin
  will not be `hpp` — which origin they get (likely `api`) is unverified until
  the first real purchase; tell that overseer.
- **lesko_giulia_apps** (`werk lesko_giulia_apps`) — maintains the Lesko-Help
  GitHub org; it does not act on this repo.

## Traps

- **`main` is production.** Never push a half-finished page. On 2026-09-29
  a Claude session pushed three commits straight to `main` (add checkout and
  welcome pages, point back, remove them again) — net zero, but each one was
  live for minutes.
- **Giulia pushes to `main` too**, via GitHub upload, several times a day
  when she is editing. Always `git fetch` before judging a diff; a worktree
  cut from stale `origin/main` lands on top of her copy edits.
- **Merges are Martin's.** A Claude session on this machine cannot merge a
  PR (the auto-mode classifier blocks "merge without review"); `wt-done.sh`
  pushes the branch to `main` only when Martin says "land it".
- **Look at the page before calling it done.** Anchors under the fixed nav
  need `scroll-margin-top` (the guarantee band needed 110px); a 200 from curl
  says nothing about what the visitor sees. Use real Chrome
  (claude-in-chrome): the headless claude-browser gets a Cloudflare 403 on
  leskohelp.com.
- **The old footer links** to `free.lesko.com/...` all redirect to the sales
  VSL; most of the ClickFunnels funnel is dead (memory
  `reference_lesko_clickfunnels_link_traps`). PR #2 (`fix/dead-footer-links`,
  merged 2026-09-30) points them at the MN sign-in, the privacy policy and the
  in-page guarantee band; there is no standalone guarantee page on any domain.
- **`llms.txt` and `sitemap.xml` repeat the checkout links** — update them
  with `index.html`.

## Working agreements

- **Never work on `main`.** New work gets a worktree (`wt-new.sh`).
- **Clean tree before you start**, `git add -N .` before any review,
  `git diff HEAD` never bare `git diff`.
- **One idea per commit**, the message says what changed and which invariant
  it holds. Martin reads back with `git log -p --reverse`.
- **Explanation belongs in the code.** Every script block or function touched
  gets a plain-language comment: input, output, why. `index.html` is read by
  Giulia as well as by Martin — no minified code.
- The page is Giulia's to write; a worktree changes copy only when the brief
  says so.
