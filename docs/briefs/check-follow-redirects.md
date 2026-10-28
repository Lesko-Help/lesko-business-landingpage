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
client: none
repo: landing
rails: none
module: page
spec: docs/specs/modules/page.md
folder: scripts/
deploy: no
data: none
---

# Brief: check-follow-redirects

Stages: review:300

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below, under Goal and Done when, with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)

## Goal

scripts/check-cf-checkout.sh follows the 302 from checkout.leskobusiness.com/<plan> (max 3 hops, paced, honest UA) and asserts page id, plan code and price on the final page, exactly as spec page.md B7 now reads. Script and its test only; red first against origin/main; no deploy.

## Done when

The test or assertion that must go from red to green. Name it. If it does not
exist yet, writing it is the first task — and prove it goes red before trusting
it green.

`scripts/test-check-cf-checkout.sh` (new): a local stand-in server plays ClickFunnels (short path 302 to a slug page) and the checker runs against 11 scenarios (1 to 3 hops live; 4 hops, a loop, another host, wrong page id, a 404 dead; a 429 unknown). Red first against the unchanged checker (11 of 12 lines FAIL, only `plain`, no redirect, passed); green after the checker follows redirects.

Spec: unchanged because page.md B7 already says what the checker must do; this branch builds it.

## Agentic review

### Verdict
Verdict: `<fill in — pass, or changes requested>`

### Findings
What the overseer's review subagent flagged — style, bugs, security —
one line each. A trimmer before Martin's read, not a replacement for it.

### Fixed in
Which commit fixed each finding, or "not fixed — see report" — one line
each.

This section is filled last, after the overseer runs its review subagent
and sends the findings back — never by the worker reviewing its own
diff. Record the findings under Findings (word for word) and the
fixes under Fixed in (one line per finding, naming its commit), fix
what needs fixing, commit, then report again the normal way. Also
leave the `Verdict:` line exactly as it stands: the overseer fills
it at review.

wt-done.sh's check on this is literal: it greps this brief for a line
starting with exactly `Verdict:` at the very start of the line (column 0)
— no bold, no indent, no renamed label, no different case. Keep the
`Verdict:` line reading exactly as it does above, or the guard cannot see
it and treats the brief as not yet reviewed.


## May touch

Module `page`. `scripts/check-cf-checkout.sh` and `scripts/test-check-cf-checkout.sh` only.

## Deploy implied

None. A hand-run script in `scripts/`, which `.assetsignore` keeps off the public site.

## Context

Spec: `docs/specs/modules/page.md` B7 and its 2026-10-28 decision line (Martin kept the CF slugs: `/monthly` 302 to `/monthly64133517`, `/half-year` 302 to `/business_half-year`, `/yearly` 302 to `/business_yearly`; the buttons stay on the short paths).
Memory message from the overseer: had not arrived when this brief was committed (2026-10-28).
Choice made here where B7 is silent: a redirect to another host is read as dead (reason "redirected to another host"), and a loop is dead through the 3-hop limit. Proposed for B7 under Spec proposals.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

- `docs/specs/modules/page.md` B7, after "at most 3": add "a redirect to another host is dead, not followed". Why: the check proves the page on our own domain; following a foreign host would assert on a page we do not own, and the spec was silent.

## State

Replaced in full each time the context guard asks you to save — never append another checkpoint.
About 60 lines max. Old traps stay (they are short and worth keeping); everything else gets
overwritten with the current picture.

Done:
In flight (file:line):
Next:
Traps (with dates):
