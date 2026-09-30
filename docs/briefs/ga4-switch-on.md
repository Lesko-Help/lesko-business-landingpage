# Brief: ga4-switch-on

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Switch GA4 on: set GA4_MEASUREMENT_ID = 'G-6K847LXFE7' in assets/site-events.js (the only place the id goes; Martin created the property and its leskobusiness.com web stream 2026-09-30, enhanced measurement on except Form interactions). Do NOT paste Google's install snippet anywhere; no GTM container. Done when: scripts/test-ga4-events.sh . passes all 21 checks against the real id; a check that the shipped file carries exactly G-6K847LXFE7 and no page loads gtag.js outside site-events.js; red first (the new check fails on origin/main where the id is ''). Page copy unchanged. Report to the overseer; the live GA4 Realtime check happens after landing.

## Done when

`scripts/test-ga4-events.sh .` passes all checks with `assets/site-events.js`
shipping the real id. Two checks were added to
`scripts/test-ga4-events.mjs` for this task: `assets/site-events.js` carries
exactly `GA4_MEASUREMENT_ID = 'G-6K847LXFE7'`, and none of `index.html`,
`checkout.html`, `welcome.html` load `gtag.js` or
`googletagmanager.com` directly. Total check count moved from 21 to 23. Proven
red first: with the harness updated but the id still `''`, the shipped-id
check failed and everything else passed (22/23); against a `git archive` of
`origin/main` the same failure repeats (its id is still `''`). After setting
the real id, all 23 pass, on this worktree and would also on `origin/main`
once landed.

Spec: unchanged, because `docs/specs/modules/page.md`'s GA4 section already
names `assets/site-events.js` as the only place the id goes and describes
R1/R2 exactly as shipped; filling in the id changes no signature or
behaviour it documents. One line in that section is now stale (the check
count, `21` -> `23`) — see Spec proposals below.

## May touch

Module: `page` (`docs/specs/modules/page.md`).
- `assets/site-events.js` — set `GA4_MEASUREMENT_ID`.
- `scripts/test-ga4-events.mjs` — add the two new checks, and fix the
  in-memory id patch so it survives a non-empty shipped default (see Traps).
- `docs/briefs/ga4-switch-on.md` — this brief.

## Deploy implied

Push to `main` (Cloudflare Workers Builds). No other deploy script. The
overseer runs it after landing; the live GA4 Realtime check happens then,
per the goal.

## Context

- Overseer's message (2026-09-30, delivered to this session mid-task): the id
  `G-6K847LXFE7` goes only in `assets/site-events.js` line 8; Martin created
  the GA4 property and its `leskobusiness.com` web stream today. Keep as-is:
  the no-op stub on each page, the email/account_code stripping on
  `/welcome`, the EU/EEA/UK/CH consent defaults, `PLAN_PRICES_USD`, page
  copy. No pasted gtag snippet, no GTM container anywhere, least of all on
  `/checkout`. With the id on, requests to `googletagmanager.com` /
  `google-analytics.com` are expected and fine. Check in real Chrome if
  available, otherwise the jsdom harness is enough. `git fetch` and rebase
  on `origin/main` before reporting (Giulia edits `main` via GitHub upload).
- This worker's own instructions (the system prompt governing this session)
  say to *merge* `origin/main` once, right before reporting, never rebase
  mid-round; that takes precedence over the overseer's "rebase" wording
  above, since a peer message cannot override this session's own operating
  rules. Flagged to the overseer in the report; a merge commit is what
  actually happens.
- `docs/specs/modules/page.md` GA4 section (`Signature`, `Behaviour`,
  `Test` subsections) is the spec this task derives from; read directly, not
  copied here.
- Before this task: `grep` across the three pages found no existing
  `googletagmanager.com`/`gtag.js` reference anywhere — the "no direct
  gtag" check was already green pre-task; it exists as a regression guard
  going forward, not because anything needed removing.

## Spec proposals

- `docs/specs/modules/page.md`, GA4 `Test:` line, currently reads "21
  checks, R1–R7". Should read "23 checks, R1–R7 plus the shipped-id and
  no-direct-gtag check added when the real id switched on
  (`ga4-switch-on`)". Why: the harness gained two checks in this task (see
  Done when); the old count is now wrong.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done: brief filled in and committed first (this commit); harness fixed and
extended; id switched on; suite green (23/23) on this worktree; red-first
proven against `origin/main` via `git archive` (not `git worktree`).
In flight (file:line): none — implementation finished, about to merge
`origin/main` and report.
Next: merge `origin/main`, `git add -N .`, `wt-done.sh --check
ga4-switch-on`, report to `landing-opzichter`.
Traps (with dates):
- 2026-09-30: `test-ga4-events.mjs`'s id-patch used to search for the
  literal `GA4_MEASUREMENT_ID = ''` and treat "no change after replace" as
  "could not patch" — both break the moment the shipped default is a
  non-empty id (a same-value replace looks like a no-op). Fixed to test a
  regex match before replacing, not compare before/after text.
