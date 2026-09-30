# Brief: branded-checkout

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Copy checkout.html, welcome.html and assets/flow.css unchanged from origin/checkout/branded-pages (27f77fd) onto current main, and point every checkout link (three pricing buttons, sticky bar, bottom CTA, JSON-LD offers, llms.txt, sitemap.xml) at /checkout?plan=monthly|half-year|yearly; keep the footer links and GA4 block as they are; /checkout and /welcome must load and must not be hidden by .assetsignore

## Done when

Two checks, both from red to green:

1. `grep -c 'leskohelp.recurly.com/subscribe' index.html` is `0` for the
   three pricing-card buttons, the three JSON-LD offer URLs and the bottom
   CTA (7 occurrences today) — they all read `/checkout?plan=<code>` instead
   — and `grep -c 'leskohelp.recurly.com/subscribe' llms.txt` is `0` for its
   3 plan lines. Red today (7 and 3); green once index.html and llms.txt are
   edited.
2. `npx wrangler dev` serving this worktree's files, then
   `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:PORT/checkout`
   and `.../welcome` both print `200` (checkout.html/welcome.html do not
   exist on this branch yet, so red today — curl gets `404`).

Spec: unchanged because checkout.html/welcome.html have no module spec yet
(new files, not covered by page.md's Functions section) and the goal itself
(copy files unchanged, repoint links) is the whole test — nothing here
diverges from page.md, whose "Public entry points" line this task extends
with the two new ones.

## May touch

Module: `page` (`docs/specs/modules/page.md`) — `index.html`, `llms.txt`,
`sitemap.xml`. Plus two files the page module doesn't own yet:
`checkout.html`, `welcome.html`, `assets/flow.css`, copied unchanged from
`origin/checkout/branded-pages` (27f77fd). Nothing else — not
`.assetsignore` (already lets these three through), not `worker.js`, not the
GA4 block or footer links inside index.html.

## Deploy implied

`main` deploys itself (Cloudflare Workers Builds watches `main`; there is no
deploy script in this repo). This worktree does not deploy anything — the
overseer merges to `main` after landing.

## Context

- Goal and plan codes came from the overseer's memory message (2026-09-30,
  relayed at worktree start): monthly→`business-monthly` $29.95,
  half-year→`business-half-year` $89.95, yearly→`business-yearly` $149.95;
  Martin decided 2026-09-30 pages and buttons go live in one landing, GA4
  later.
- Do NOT `git merge origin/checkout/branded-pages` — it was cut from
  `524f8b4`, which `fb92c84` reverted on `main`; a merge conflicts on the
  three new files (modify/delete) and silently drops today's index.html
  changes. Take the three files with
  `git checkout 27f77fd -- checkout.html welcome.html assets/flow.css` and
  redo the link edits by hand on today's index.html (already has PR #2's
  footer links and PR #4's GA4 block — leave both alone).
- Reference for the link edits: `git show 524f8b4 -- index.html llms.txt`
  (7 links in index.html: 3 JSON-LD offer URLs, 3 pricing-card buttons, 1
  bottom CTA; 3 in llms.txt). Confirmed by reading today's index.html that
  it is still exactly these 7 occurrences — no more, no fewer.
- Checked 2026-09-30: checkout.html/welcome.html at 27f77fd already show
  $29.95 / $89.95 / $149.95, matching today's index.html, and both carry
  `<meta name="robots" content="noindex, nofollow">`.
- `sitemap.xml` today has one `<url>` for `/` only, no checkout link — the
  goal's "point every checkout link ... in sitemap.xml" has nothing to touch
  there; leaving it alone (adding noindex pages to a sitemap would be
  wrong). Flagging this in the report rather than guessing at an edit.
- `wrangler.jsonc`'s `assets.html_handling` is `auto-trailing-slash`, so
  `/checkout` and `/welcome` should resolve to `checkout.html`/`welcome.html`
  without the extension automatically; done-when item 2 proves it with a
  local `wrangler dev`, not a guess.
- Trap (2026-09-30, from the overseer's memory message): CLAUDE.md's "Where
  the buttons go" table also names "the sticky bar" as linking to Recurly.
  No such element exists in today's index.html — the only sticky element is
  the top `nav` bar, whose `nav-cta` link is `href="#pricing"` (scrolls to
  the pricing section, not a direct checkout link). Nothing to repoint there;
  flagging the stale wording in the report instead of editing CLAUDE.md
  (overseer-owned).

## Spec proposals

None yet — see State for anything found while coding.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done: brief filled in from goal + overseer's memory message.
In flight: about to copy checkout.html/welcome.html/assets/flow.css from
27f77fd, then repoint links in index.html and llms.txt.
Next: write the red-then-green checks (grep counts, wrangler dev + curl),
run them red, make the edits, run them green, report to the overseer.
Traps (with dates):
- 2026-09-30: do not merge origin/checkout/branded-pages, use
  `git checkout 27f77fd -- <files>` instead (see Context).
- 2026-09-30: CLAUDE.md's "sticky bar" claim is stale — no such link exists
  in today's index.html (see Context).
