# Brief: checkout-intl

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Make the checkout's billing form accept a non-US address: which fields are required follows the country select, and a blocked Pay press always shows why. Build the two 'to build, decided 2026-10-06' rules under 'The checkout' in docs/specs/modules/page.md exactly as written there; checkout.html only, no worker.js or Recurly change.

## Done when

A new suite, `scripts/test-checkout-address.sh` (jsdom, same pattern as
`scripts/test-ga4-events.sh`), goes red against `origin/main` and green on
this branch, covering both "to build" rules from `docs/specs/modules/page.md`:

- the region field (`#state`) is required only for `US`, `CA`, `AU` and the
  postal field (`#postal_code`) is required everywhere except `AE`, `BS`,
  `JM`, `TT`, `GH`, both tracking the country `<select>` live;
- a blocked Pay press (missing required field) always shows, in `#payMsg`,
  which field is missing, and scrolls to that field — never returns in
  silence.

Run with `run-suite.sh scripts/test-checkout-address.sh .`.

Spec: unchanged — `docs/specs/modules/page.md` already carries both rules
under "The checkout" (`<!-- ... (to build, decided 2026-10-06) -->`); this
task builds them, it does not change what they say.

## May touch

Module: `page`. Files: `checkout.html` only (per the goal — no `worker.js`,
no Recurly config change), plus the new
`scripts/test-checkout-address.sh` / `.mjs` test pair and this brief.

## Deploy implied

None run by this worktree. Lands via `wt-done.sh` push to `main`; Cloudflare
Workers Builds deploys `main` automatically (no separate deploy script for
this repo — see CLAUDE.md "Deploy").

## Context

- Spec: `docs/specs/modules/page.md`, section "The checkout", the two
  "(to build, decided 2026-10-06)" bullets (billing address fields; blocked
  Pay always says something) — read in full before coding, not just this
  summary.
- Current `checkout.html` (as of `9737438`): `state` and `postal_code` are
  both hard-coded `required`, labelled "State" / "ZIP code"; `postal_code`
  carries `inputmode="numeric"`; `recurly.configure({ required: [...] })`
  lists `state` and `postal_code` too. The submit handler's `collect()`
  marks bad fields with an `.err` class and focuses the first one, but on
  failure the handler just `return`s — no `showError()` call, so `#payMsg`
  never appears. This is the "most likely cause of Martin's failed Belgian
  attempt on 2026-10-05" the spec names.
- No memory message had arrived from the overseer by the time this brief was
  committed (first commit on this branch). If one arrives later, its content
  gets added here then.

## Spec proposals

(none yet)

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
