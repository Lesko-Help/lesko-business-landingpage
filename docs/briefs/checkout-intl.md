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

Done:
- Brief committed (first commit, `8be90fa`).
- New suite `scripts/test-checkout-address.sh` + `.mjs` (jsdom, modelled on
  `test-ga4-events.sh`), 26 checks. Proved red against the then-current
  `checkout.html` first (every check tied to one of the two spec rules
  failed, exactly as expected; nothing failed for an unrelated reason).
- `checkout.html` edited: `state`/`postal_code` inputs no longer hard-coded
  `required`; label text "State / Province / Region" / "Postal code";
  `inputmode="numeric"` removed from postal. New `REGION_REQUIRED_COUNTRIES`
  (`US`,`CA`,`AU`) / `NO_POSTAL_COUNTRIES` (`AE`,`BS`,`JM`,`TT`,`GH`) and
  `updateAddressRequirements()`, run on load and on the country select's
  `change`. `recurly.configure({required:...})` cut to
  `first_name,last_name,address1,city,country`. `collect()` now tracks the
  first bad required field and calls `showError()` naming it and scrolling
  to its `.field`, instead of returning in silence; `showError()` takes an
  optional scroll target.
- Suite now green (26/26) on the edited `checkout.html`; `test-ga4-events.sh`
  re-run too, still green (no regression).
- Not yet done: commit the `checkout.html` + test changes, merge
  `origin/main`, `wt-done.sh --check`, report to the overseer.

In flight: none — about to commit.

Next:
- Commit the `checkout.html` edit and the new test pair as one commit
  (one idea: "build the two to-build billing-address rules").
- `git fetch && git merge origin/main` (not yet done this session — check
  nothing moved under us, Giulia pushes to `main` directly too).
- `git add -N .`, `git status` clean, then `wt-done.sh --check checkout-intl`
  until it exits 0.
- Report to `landing-opzichter` with branch, commit range, HEAD sha, the
  red-then-green proof, and that this is `checkout.html` only (no deploy
  script to run beyond the normal `main` push Cloudflare does on its own).

Traps (with dates):
- 2026-10-06: `window.fetch` resolving to an already-fulfilled Promise still
  needs several microtask ticks (`fetch().then(r=>r.json()).then(...)` is 2
  chained `.then`s plus one promise-adoption hop) before a jsdom test can
  read what the second `.then` did — one or two `await Promise.resolve()`
  is not enough; loop ~10 times (see `flushMicrotasks()` in
  `scripts/test-checkout-address.mjs`).
- 2026-10-06: in a jsdom-eval'd `<script>`, a bare identifier like `recurly`
  (not `window.recurly`) does resolve to the window global set from the
  test harness — no need to rewrite the page's own code to use `window.`
  explicitly just to make it testable.
