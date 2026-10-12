# Brief: wallet-google-pay

Stages: oneshot

Written by the overseer (window 1) before work starts; the first commit on this
branch. The worktree session reads this before touching anything. (wt-new.sh
fills in the two `<!-- ... -->` markers on this page — the line above with
this task's `Stages: ...` summary, the one below with this task's gate
fragments from TEMPLATE.d/, in WT_STAGE_ORDER; if either marker text is still
here, something skipped that step.)


## Goal

Build Google Pay on /checkout, to spec: docs/specs/modules/wallets.md sections G1-G5. IT IS NOT COMMITTED YET: read it at /Users/admin/Lesko/lesko-business-landingpage/docs/specs/modules/wallets.md (overseer folder, branch main, uncommitted pending Martin's approval). You do NOT own the seam: K1-K5 (window.LeskoCheckout), C1-C6 (assets/wallet-common.js) and W1-W4 (the worker wallet branch) belong to branch wallet-paypal. Before writing anything, git fetch and check whether wallet-paypal has landed on origin/main; if it has, rebase onto it and build only assets/wallet-google-pay.js plus its one script tag. If it has not, write only the seam parts you actually need, exactly as the spec pins the signatures, and tell the overseer so it keeps one copy at landing. Ship with WALLETS.google_pay = false and GOOGLE_MERCHANT_ID = '' - nothing may be reachable by a buyer, because Recurly here is Authorize.Net-only, Recurly does not list it as a Google Pay gateway, and Google Pay also needs a merchant id and 3-D Secure on the gateway, all of which are Martin's to arrange. Write scripts/test-wallet-google-pay.sh and show it red first against origin/main. Change no copy, no price, and nothing in index.html or welcome.html.

## Done when

`scripts/test-wallet-google-pay.sh .` passes (0 exit), proving G1-G5 of
`docs/specs/modules/wallets.md`: the button mounts only with the switch on
*and* a non-empty `GOOGLE_MERCHANT_ID` (G1); when it mounts, `recurly.GooglePay()`
gets `currency/country/total/googleMerchantId/billingAddressRequired/requireEmail`
exactly as the spec writes them, `total` matching the active plan's price
(G2); its `token` event calls `payWithWallet('google_pay', token.id, buyer)`
with email/first/last name each defaulting to `''` (G3); a throwing
`GooglePay()`, a missing `window.PaymentRequest`, or its own `error` event
all leave `#wallets` empty/button removed and the card path untouched (G4);
`GOOGLE_MERCHANT_ID` is the one constant at the top of the file, empty as
shipped (G5). Proven red first against `origin/main` (git archive, scratch
dir — neither `assets/wallet-google-pay.js` nor the test exists there), then
green on this branch.

Spec: unchanged because the task matches G1-G5 and the already-pinned seam
signatures (K1-K5, C1-C6) exactly; nothing needed clarifying or diverging
from what `docs/specs/modules/wallets.md` already says.

## May touch

Module: `wallets` (`docs/specs/modules/wallets.md`).
Files: `assets/wallet-google-pay.js` (new, owned by this task), plus the
seam this task depends on but does not own — `assets/wallet-common.js`
(new) and the `window.LeskoCheckout` publish + `#wallets` row in
`checkout.html` — written only because branch `wallet-paypal`, which owns
K1-K5/C1-C6/W1-W4, had landed zero commits on `main` as of 2026-10-09 (see
Context). Also `scripts/test-wallet-google-pay.sh` and `.mjs` (new). Not
touched: `index.html`, `welcome.html`, `worker.js` (the W1-W4 wallet branch
is not needed — nothing is reachable with the switch off and the merchant id
empty, and no test here calls the real `/api/subscribe`), any copy or price,
`docs/specs/`.

## Deploy implied

Push to `main` (Cloudflare Workers Builds) — the `wallets` module's own
deploy. Nothing becomes reachable by a buyer: `WALLETS.google_pay = false`
and `GOOGLE_MERCHANT_ID = ''` ship exactly as the brief's Goal requires.

## Context

- 2026-10-09: `wallet-paypal` branch exists (worktree +, tmux window of the
  same name) but had 0 commits ahead of `main` when this task started —
  checked with `git rev-list main..wallet-paypal --count`. It owns K1-K5
  (`window.LeskoCheckout`), C1-C6 (`assets/wallet-common.js`) and W1-W4 (the
  worker wallet branch) per `docs/specs/modules/wallets.md`. Since it had not
  landed, this task wrote the seam parts it actually needed (the
  `LeskoCheckout` publish in `checkout.html`, and a full `assets/wallet-common.js`)
  itself, built exactly to the spec's pinned signatures — **tell the overseer
  to keep only one copy of each at landing**, whichever branch lands second
  should drop its own copy if `wallet-paypal`'s differs, or confirm they
  match if not.
- 2026-10-09: the overseer's memory-bank message with prior context for this
  goal had not arrived by the time this brief was first committed. None has
  arrived since either; this task proceeded on the brief's own Goal text and
  the spec alone.
- 2026-10-09: the exact JS field names Google/Recurly return for a wallet
  sheet's billing contact are not pinned anywhere (the spec only says
  "billing contact", no field names). This task reads them off the token
  object directly — `token.email`, `token.firstName`, `token.lastName` — to
  match the already-pinned PayPal example (P3: `{email: token.email, ...}`,
  top-level, not nested). Not a spec conflict, just an implementation choice
  this task owns; noted here in case Martin's real Recurly integration later
  turns out to nest these differently (then only `wallet-google-pay.js`'s
  `token` handler needs changing, nothing else).

## Spec proposals

Specs belong to the overseer (DECISION BY MARTIN 2026-09-24) — this worktree
never edits docs/specs/ itself. Anything found missing, unclear or wrong in a
module's spec goes here instead: what the spec says now, what it should say,
and why. The overseer applies what it agrees with on main.

## State

Done:
- Rounds 1-3 (2026-10-09 to 2026-10-10): built G1-G5 on top of an own-written
  copy of the seam (`checkout.html`'s `window.LeskoCheckout`,
  `assets/wallet-common.js`) because `wallet-paypal`, which owns that seam,
  had landed nothing yet. Fixed, across three overseer review rounds: the
  mount-before-`onReady` ordering defect, the `finish(result, tokenId,
  buyerEmail)` signature, and an email-casing gap (`buyerEmail`/wallet email
  not trimmed/lower-cased the same way the card path always was). All three
  rounds passed review; approved, not landed. Final state of that work:
  commits `3832996`/`17ba9c5`/`2616053`/`9122692`/`589fe68`/`dd3fe44`.
- 2026-10-12: `wallet-paypal` landed on `main` at `450d13f` with its own,
  independently-written and now-production versions of
  `assets/wallet-common.js` and `checkout.html`'s seam — stricter than mine
  (`markReady()`/`onReady` wraps each callback in its own try/catch and
  fires last, after `Elements()`/`card.attach`; `payWithWallet` falls back
  to the page's own `#email`/`#first_name`/`#last_name` fields; the card
  path's own `add_payment_info` now names itself `payment_type: 'Credit
  Card'`, C4 amendment). Overseer instruction: discard my two copies of
  these files wholesale, keep only `assets/wallet-google-pay.js` +
  its tests + this brief, re-add one `<script defer>` line for
  `wallet-google-pay.js` in the landed `checkout.html`, and switch
  `recurly.GooglePay()` to `window.recurly.GooglePay()` to match PayPal's
  style. Read the current `docs/specs/modules/wallets.md` (overseer's own
  checkout, still uncommitted pending Martin) directly — confirms K6's two
  ordering rules, C4, and a new **K3c** open gap (the 3DS retry branch is
  card-only; not a wallet branch's to fix, only to comment on at the seam).

Done (round 4, rebase onto `450d13f`, finished 2026-10-12):
- `git merge origin/main --no-edit` (branch was `dd3fe44`, 11 ahead / 23
  behind). Conflicted exactly on the two files the overseer predicted
  (`assets/wallet-common.js` add/add, `checkout.html` content). Resolved
  with `git checkout --theirs` on both, taking the landed, production
  versions wholesale rather than hand-merging — this branch's own two
  earlier copies of the seam are gone.
- Re-added exactly one line in `checkout.html`,
  `<script src="/assets/wallet-google-pay.js" defer></script>`, beside the
  landed `wallet-paypal.js` tag, and widened the comment above both from
  "one shared file plus one file per method... neither file" to name all
  three files.
- `assets/wallet-google-pay.js`: `recurly.GooglePay(...)` →
  `window.recurly.GooglePay(...)`, matching the landed `wallet-paypal.js`'s
  `window.recurly.PayPal(...)`. No red-before-green proof for this one — in
  both a real browser and this repo's jsdom test harness `window` IS the
  script's global scope, so bare `recurly` and `window.recurly` already
  resolved to the same object; the change is a style match, not a behaviour
  change, so there was no failing check to provoke first.
- Everything else in `assets/wallet-google-pay.js` kept as-is: still the
  top-level `if (window.LeskoCheckout) window.LeskoCheckout.onReady(init)`
  call (not `wallet-paypal.js`'s `DOMContentLoaded`-then-inner-`onReady`
  shape) — the overseer's instruction named only the `window.recurly`
  rename, and the two shapes are equivalent against the landed seam's
  `onReady`/`markReady` (checkout.html: queues if not ready yet, calls
  immediately if already ready), so this branch did not restructure beyond
  what was asked.
- Merge committed as `765924a` (includes the script tag and the rename —
  both needed to make the merge resolution actually work, so kept as one
  commit rather than split after the fact).
- Ran `scripts/test-wallet-google-pay.sh .` against the rebased seam: 46/46
  PASS, no changes needed to my own test file. The overseer had flagged
  check 32/33 (email normalisation) as a likely casualty of the landed
  seam's page-field fallback — it was not: this suite's own fallback cases
  stub `payWithWallet` directly rather than exercising the real
  `wallet-common.js`, so the new fallback branch never fires in it.
- Ran every landed wallet suite for regression, all green: `test-wallet-seam.sh`
  (20/20), `node test-wallet-common.js assets/wallet-common.js` (26/26),
  `test-wallet-paypal.sh` (13/13), `node test-subscribe-wallet.js worker.js`
  (18/18). Also re-ran this branch's own pre-existing regressions:
  `test-checkout-address.sh` (26/26), `test-ga4-events.sh` (ALL PASS). Did
  not run `test-subscribe-rate-limit.sh` (forbidden from this worktree —
  port 8799 hazard, independently broken on `main`).

Next: report this round's completion to the overseer. Not landing
anything — that is Martin's call. Leave `## Agentic review` and any
Verdict line for the overseer to write.

Traps (with dates):
- 2026-10-09: jsdom does not implement `window.PaymentRequest`; the test
  sets it manually (`opts.hasPaymentRequest !== false`) and the shipped
  `wallet-google-pay.js` checks for it explicitly (G4) before ever calling
  `recurly.GooglePay()`.
- 2026-10-12: `docs/specs/modules/wallets.md` does not exist in this repo on
  any branch or in any commit — it is the overseer's own, uncommitted file
  at `/Users/admin/Lesko/lesko-business-landingpage/docs/specs/modules/
  wallets.md` (outside any worktree), pending Martin's approval. Read it
  with an absolute path, not `git show origin/main:...`.
  `assets/wallet-common.js` and `checkout.html`'s seam are now
  `wallet-paypal`'s production files (landed `450d13f`) — take them
  wholesale, never hand-merge against this branch's own older copies; they
  fell back to the page's own `#email`/`#first_name`/`#last_name` fields
  and wrap each `onReady` callback in its own try/catch, both stricter than
  what this branch had written on its own.
- 2026-10-12: do not run `scripts/test-subscribe-rate-limit.sh` from this
  worktree — its cleanup `pkill`s/`kill -9`s whatever holds port 8799,
  which may be another session's `wrangler dev`. Independently known-broken
  on `main` since the `SEND_EMAIL` binding landed (six 501s instead of five
  503s and a 429) — not this branch's regression.
- 2026-10-12: spec's new **K3c** (3DS retry branch is card-only, reads
  `#email`/`#first_name`/`#last_name` on re-submit) is explicitly not a
  wallet branch's to fix — comment on it at the seam only, leave the fix to
  whoever owns the 3DS retry worktree.
