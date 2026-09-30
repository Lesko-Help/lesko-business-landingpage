# Brief: branded-live

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

DECISION BY MARTIN 2026-09-30: go live with the one-step branded checkout fast, fix issues later. Bring checkout.html, welcome.html, assets/flow.css and worker.js from origin/checkout/branded-pages (f8a42b5, Recurly.js card field + /api/subscribe + /api/config) onto current origin/main, byte-identical to that branch — no redesign, no fixes. Keep main's index.html, llms.txt, sitemap.xml, CLAUDE.md and docs/specs untouched; confirm the plan links in index.html (/checkout?plan=...) match what checkout.html reads. Do not push to main, do not touch Cloudflare or Recurly. Report the diff to the overseer. Known issues for LATER tasks, not this one: no bot or rate limit on /api/subscribe, account code = email, RECURLY_PUBLIC_KEY lost on deploy as a Text var.

## Done when

A four-part diff check, run from the worktree root:

    for f in checkout.html welcome.html assets/flow.css worker.js; do
      git diff --quiet origin/checkout/branded-pages -- "$f" && echo "OK $f" || echo "FAIL $f"
    done
    for f in index.html llms.txt sitemap.xml CLAUDE.md; do
      git diff --quiet origin/main -- "$f" && echo "OK $f" || echo "FAIL $f"
    done
    git diff --quiet origin/main -- docs/specs && echo "OK docs/specs" || echo "FAIL docs/specs"

Red now (2026-09-30, before any copy): `checkout.html`, `assets/flow.css` and
`worker.js` FAIL (they still hold the plain version added by the earlier
`branded-checkout` task); `welcome.html` already OK (byte-identical to the
target branch already). Green when every line reads OK — the four branded
files match `origin/checkout/branded-pages` (f8a42b5) exactly and nothing
else moved.

Plus by hand: the plan query strings `index.html` sends
(`/checkout?plan=monthly|half-year|yearly`) are read as the same three
values by `checkout.html`'s `q.get('plan')` — confirmed already true on both
the current and target file.

`Spec: unchanged because index.html/llms.txt/sitemap.xml/CLAUDE.md/docs/specs
are untouched (checked above); worker.js and checkout.html/welcome.html
diverge from the current worker.md spec's "Not in scope: any route but
/api/videos" and "Secrets: none" — see Spec proposals below, this is the
explicit point of the goal, not a silent divergence, so work continues while
the overseer applies the wording.`

## May touch

Module: no `checkout` module exists yet in `docs/specs/INDEX.md` — these
files are new territory, not covered by any spec, so they are coded and
tested against this brief's own done-when, not against a spec (per the
worktree instructions: "a module with no spec yet ... has nothing to derive
from"). `worker.js` does belong to the existing `worker` module and this task
knowingly outgrows that spec's scope (see Spec proposals).

Files: `checkout.html`, `welcome.html`, `assets/flow.css`, `worker.js`,
`docs/briefs/branded-live.md`. Nothing else — `index.html`, `llms.txt`,
`sitemap.xml`, `CLAUDE.md`, `docs/specs/`, `.assetsignore`, `.gitignore`,
`.werk.conf` stay exactly as they are on `origin/main`.

## Deploy implied

None run by this worktree. Once landed on `main`, Cloudflare Workers Builds
deploys it within a minute — same as every push to `main` in this repo. The
overseer runs `wt-done.sh` from `main`, not this session.

Not implied but adjacent: `worker.js`'s new `/api/subscribe` route reads the
Worker secret `RECURLY_API_KEY` and the Worker var `RECURLY_PUBLIC_KEY`
(read by `/api/config`). The goal names `RECURLY_PUBLIC_KEY lost on deploy as
a Text var` as a known issue for a LATER task — not fixed here, only copied
in as-is from `origin/checkout/branded-pages`.

## Context

Goal source: DECISION BY MARTIN 2026-09-30 ("go live with the one-step
branded checkout fast, fix issues later"), relayed by the overseer into this
brief's Goal line before this session started.

No overseer memory message had arrived by the time this brief was committed
(checked via ReadNotifications, empty). If one arrives later, its content
gets added here.

Source branch inspected directly: `origin/checkout/branded-pages` tip
`f8a42b5` ("Checkout: one step, with Recurly.js card field inside our
page"), reached through `27f77fd` and `524f8b4` from Giulia's original
upload commits `c0e10a7`/`8a2b3a0`.

Found on arrival: this branch already starts even with `origin/main`
(`d8f37c7`) — the earlier `branded-checkout` task (add the plain
checkout/welcome pages, point index.html's links at `/checkout` instead of
Recurly directly) had already landed before this worktree was cut. That is
why `welcome.html` needs no change: it was already byte-identical to the
target branch's version.

## Spec proposals

**`docs/specs/modules/worker.md`** — the Overview and Functions sections
still describe a worker that only answers `/api/videos` and holds no
secrets. After this task, `worker.js` also answers `/api/subscribe` (POST,
creates a Recurly purchase from a Recurly.js card token; needs Worker secret
`RECURLY_API_KEY`) and `/api/config` (GET, hands back `RECURLY_PUBLIC_KEY`
so no key sits in the repo). Proposed changes:
- `Secrets:` line: from `none` to `RECURLY_API_KEY` (Worker secret, set by
  Martin in Cloudflare, never in the repo).
- `Not in scope:` line: drop "any route but `/api/videos`"; add "the
  checkout page's own fields and styling (owned by whatever module ends up
  covering `checkout.html`/`welcome.html`/`assets/flow.css` — none yet)".
- New Functions subsections for `subscribe(request, env)` (`/api/subscribe`)
  and the `/api/config` branch of `fetch`, each with the same Signature /
  What it does / Examples / Inputs / Outputs / Errors / Test shape as the
  existing `/api/videos` entry — behaviour as read directly from
  `origin/checkout/branded-pages:worker.js` (this brief's Done when section
  above has the file read in full).
- A new **`checkout`** module row in `docs/specs/INDEX.md` for
  `checkout.html`, `welcome.html`, `assets/flow.css` — no spec file exists
  for these yet; today's task only copies them in unchanged, so it does not
  write that spec itself, only flags that one is now owed.

Named to the overseer in the landing report; not applied here (worker
settings deny Edit/Write under `docs/specs/`).

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done: brief filled in and committed; done-when check proved red.
In flight: none yet.
Next: copy checkout.html, assets/flow.css, worker.js from
  origin/checkout/branded-pages (f8a42b5); re-run the done-when check for
  green; commit; wt-done.sh --check; report to overseer.
Traps (with dates):
- 2026-09-30: origin/main already carried this branch's starting point
  (d8f37c7) before this worktree existed — the earlier `branded-checkout`
  task had landed. A fresh worktree here is not starting from a blank page;
  check `git diff origin/main...HEAD` before assuming nothing is done yet.
- 2026-09-30: `worker.js` on the target branch adds `/api/subscribe` and
  `/api/config`, using Worker secret `RECURLY_API_KEY` and var
  `RECURLY_PUBLIC_KEY` — this outgrows worker.md's current "Not in scope:
  any route but /api/videos" / "Secrets: none". Expected by the goal, not a
  bug; the spec just hasn't caught up (see Spec proposals).
