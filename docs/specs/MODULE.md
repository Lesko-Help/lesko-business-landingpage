# NAME
Status: draft
Kind: KIND
Part of: `docs/specs/INDEX.md` · Deploy: `deploy-NAME.sh` · Updated: DATE
Reads: the tables, APIs and files it depends on — one line.
Writes: the tables, API calls and files it produces — one line.

Read `~/.werk/SPECS.d/STYLE.md` before filling this in. KIND is one of
`table`, `source`, `action`, `app`, `helper` (STYLE.md R9); pick it first,
then read `~/.werk/SPECS.d/kinds/KIND.md` for the body this kind needs.

## Overview

Eleven lines or fewer, this note included.

*What it is for, one line.*
*What it owns, one line.*
*What it depends on, one line.*
*Public entry points, by name — one line.*
*Not in scope, one line.*
*Secrets: which secret names it reads and from where — omit when none.*
*Personal data: which fields are about a person and the keep/hash/drop rule — omit when none.*

## Runs

Only for a `table`, `source` or `action` (it runs unattended); an `app`
or `helper` deletes this section.

- Trigger: schedule, event or by hand · Where: Cloud Run job, Dataform, cron, laptop.
- Silence window: the schedule plus a margin; no successful run inside it → `STALE`.
- Alerts: one line per `BTB_ALERT REPO/RUNNABLE CODE` it can raise, with the trigger.
- Money: no (yes → the SMS channel, and `Go: by hand` in an action).
- Run twice: idempotent, duplicates, or refuses — say which.
- Backfill: how to rerun for a past window.

## KIND body

Replace this heading with the sections `~/.werk/SPECS.d/kinds/KIND.md`
asks for: `## Columns`, `## Derived`, `## Assertions` for a table;
`## API`, `## Lands` for a source; `## Sending` for an action;
`## Screens` (and `## LLM`) for an app; `Used by:` for a helper.

## Functions

Every kind but a `table` has this section (a table deletes it). One
subsection per public function or entry point. An unfilled one is just
the heading, the signature, and the `<!-- spec:stub -->` marker — nothing
else, until a worktree actually touches that function, like this:

### function_name(args)

*Signature, as it is in code.*

<!-- spec:stub -->

Once a worktree has actually touched the function, the subsection fills in
like this instead:

### other_function_name(args)

*Signature, as it is in code.*

*What it does:*
- R1: when INPUT is X, it does Y.
- R2: when INPUT is Z, it does W instead.

*Examples:* INPUT -> OUTPUT.

*Inputs:* one line.

*Outputs:* one line.

*Errors:* TRIGGER -> exit CODE -> `BTB_ALERT` CODE.

*Test:* the exact command, the input or fixture it uses, what is observed
(output, exit code or file), and "red first against `origin/main`" — names
the rule number it proves.

## Decisions

- DATE: the decision, in one line, and why.

<!-- spec:template -->
