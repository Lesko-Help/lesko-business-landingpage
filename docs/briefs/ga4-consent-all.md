# Brief: ga4-consent-all

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Count EU/EEA/UK/CH visitors in GA4 like everyone else (DECISION BY MARTIN 2026-10-01: drop the EU rule, no banner). In assets/site-events.js remove CONSENT_REQUIRED_REGIONS and the region-scoped 'everything denied' consent default, so every visitor gets analytics_storage granted (ad_* stay denied). Update scripts/test-ga4-events.mjs: replace the check that EU regions are denied with one that no region-scoped denial exists and analytics_storage is granted for all; prove it red against origin/main first. Update the plain-language comments in site-events.js, the Analytics section claims are the overseer's (CLAUDE.md, docs/specs/modules/page.md R2) — report wording for them, don't edit them. No other page changes.

## Done when

`scripts/test-ga4-events.sh .` is all-green, including three new checks added
for this task (on the one `gtag('consent', 'default', ...)` call `init()`
makes, across every such call, not just the first):
- "exactly one consent default is set"
- "consent default carries no region key"
- "consent default grants analytics_storage to every visitor"

Proved red first against a scratch copy of `origin/main`'s `site-events.js`
(the old region-scoped carve-out) with these same three checks added: all
three FAIL there (3 CHECK(S) FAILED). Green on this branch: all 26 checks
PASS (the 23 that already existed, unchanged, plus these 3).

Spec: unchanged because specs belong to the overseer (DECISION BY MARTIN
2026-09-24); wording this worktree would propose for CLAUDE.md's Analytics
section and `docs/specs/modules/page.md` R2 / the Personal data line is
below, under Spec proposals, for the overseer to apply.

## May touch

Module: `page` (`docs/specs/modules/page.md`). Files: `assets/site-events.js`,
`scripts/test-ga4-events.mjs` (and `.sh` only if needed — it was not). No
other page changes: not `index.html`, `checkout.html`, `welcome.html`,
`CLAUDE.md` or `docs/specs/`.

## Deploy implied

A push to `main` (Cloudflare Workers Builds watches `main`; a branch build
always fails, that is not a verdict on this change). The worktree session
does not push; the overseer lands it on `main` once Martin says so.

## Context

- DECISION BY MARTIN 2026-10-01: drop the EU/EEA/UK/CH consent rule, no
  banner. Every visitor gets `analytics_storage: 'granted'`; `ad_storage`,
  `ad_user_data`, `ad_personalization` stay `'denied'` (this site never does
  ad targeting or remarketing). No region-scoped consent default left
  anywhere in `assets/site-events.js`.
- 2026-09-30 (`682b52f`): GA4 is on with
  `GA4_MEASUREMENT_ID = 'G-6K847LXFE7'`, set only in `site-events.js`. Left
  exactly as is; `scripts/test-ga4-events.sh` still checks it ships that id.
- `window.LeskoAnalytics` stand-in on each page (R7: a blocked
  `site-events.js` must never stop a checkout) and the email-stripping on
  `/welcome` (R6) are untouched — neither needed any change for this task.
- Request came via a cross-session message from the overseer
  (`landing-opzichter`) on 2026-10-02, naming module `page`, spec section
  GA4 R2, stages: oneshot.

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

**`docs/specs/modules/page.md`, R2** — now reads:
> when set, `init()` loads gtag.js and sends `page_view`; visitors whose
> region is in `CONSENT_REQUIRED_REGIONS` (EU/EEA/UK/CH) get consent `denied`
> and therefore no analytics cookie. No linker to `leskohelp.recurly.com`
> (removed: nothing links there any more).

Propose instead:
> when set, `init()` loads gtag.js and sends `page_view`; one consent default
> applies to every visitor, no region carve-out (DECISION BY MARTIN
> 2026-10-01, dropping the earlier EU/EEA/UK/CH rule): `analytics_storage` is
> `'granted'` for everyone, `ad_storage`/`ad_user_data`/`ad_personalization`
> stay `'denied'` (this site never does ad targeting). No linker to
> `leskohelp.recurly.com` (removed: nothing links there any more).

Also propose adding a Decisions line:
> 2026-10-02: EU/EEA/UK/CH consent carve-out dropped, no banner — every
> visitor is counted in GA4 the same way (Martin, 2026-10-01). Why: the
> property is new and the funnel needs every visitor's data to read
> conversion rates correctly; a banner was already ruled out on
> 2026-09-29 for the same reason (costs conversions).

And the *Inputs* line (currently lists `CONSENT_REQUIRED_REGIONS` among the
file's top constants) should drop that name, since the constant no longer
exists.

**`CLAUDE.md`, Analytics section** — now reads:
> EU/EEA/UK/CH visitors get no analytics cookies (no consent banner).

Propose instead:
> Since 2026-10-02 (DECISION BY MARTIN 2026-10-01) there is no EU/EEA/UK/CH
> carve-out: every visitor gets `analytics_storage: 'granted'` and no consent
> banner; `ad_storage`, `ad_user_data` and `ad_personalization` stay
> `'denied'` site-wide (no ad targeting here). `scripts/test-ga4-events.sh .`
> is now 26 checks (three of them on this one consent default: it is set
> once, carries no `region` key, and grants `analytics_storage`).

**`docs/specs/modules/page.md`, Personal data line** — currently ends:
> With GA4 on, EU/EEA/UK/CH visitors get no analytics cookies.

Propose dropping that sentence (replace with nothing, or "With GA4 on, every
visitor gets an analytics cookie; no consent banner.") since it is no longer
true and the module's other personal-data facts (name/email/address to
Recurly, `localStorage`, email in the `/welcome` URL, newsletter to Kit) are
unaffected by this change.

## State

Done: `site-events.js`'s region-scoped consent default removed, replaced
with one unconditional default; three new checks added to
`test-ga4-events.mjs`, proved red against `origin/main` then green here
(26/26). Brief filled in and committed as the first commit on this branch.
In flight (file:line): none — task complete, reporting to the overseer next.
Next: report branch, commit range, red/green output and the deploy note to
`landing-opzichter`; wait for the overseer to land it.
Traps (with dates): 2026-10-02 — the mjs file had NO existing EU-region check
to "replace" (checked with grep); the brief's goal text assumed one existed,
so three checks were added fresh instead of a 1-for-1 swap. 2026-10-02 — a
first draft of the new checks read only `consentDefaults[0]`, which passed
even against the old two-call code (the first call was already the granted
one); fixed by checking across every consent-default call, which is what
actually caught the old region-scoped second call.
