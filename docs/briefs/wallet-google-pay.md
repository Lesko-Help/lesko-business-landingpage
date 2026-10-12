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
- Rounds 1-3 (2026-10-09/10): built G1-G5 on an own-written seam copy
  (`wallet-paypal` hadn't landed yet); fixed mount-before-`onReady`
  ordering, `finish(result, tokenId, buyerEmail)` signature, email-casing.
  Approved each round, not landed. Commits `3832996..dd3fe44`.
- Round 4 (2026-10-12): `wallet-paypal` landed on `main` at `450d13f` with
  its own, stricter, production `assets/wallet-common.js` and
  `checkout.html` seam. Rebased: `git merge origin/main`, resolved the two
  conflicting files with `git checkout --theirs` (took landed wholesale, no
  hand-merge); re-added one line in `checkout.html`,
  `<script src="/assets/wallet-google-pay.js" defer></script>`, widened the
  comment above it to name three files; renamed `recurly.GooglePay(...)` to
  `window.recurly.GooglePay(...)` in `assets/wallet-google-pay.js` to match
  `wallet-paypal.js`'s style (no red/green proof needed — `window` is the
  script global in both the browser and the jsdom harness, so it's a style
  match, not a behaviour change). Left the file's top-level
  `onReady(init)` shape alone (equivalent to PayPal's
  DOMContentLoaded-then-inner-onReady against the landed `onReady`/
  `markReady`; not asked for). Merge committed `765924a`.
- Round 5 (2026-10-12, overseer review fix): overseer independently re-ran
  everything, confirmed the diff is exactly 5 files, seam byte-identical.
  Found my suite never exercised `wallets.isOn('google_pay')` on its own —
  every case setting `forceMerchantId` also set `forceGooglePayOn`, so
  deleting the switch check from `init()` left the suite green (the
  merchant-id guard caught the mount anyway, wrong reason). Fixed in
  `scripts/test-wallet-google-pay.mjs`: added "merchant id present, switch
  off" case. Proved red (deleted `wallets.isOn('google_pay')` from
  `assets/wallet-google-pay.js` `init()` → exactly 2 new checks failed,
  49 stayed green) then green (restored the check → 51/51 PASS). Also
  corrected a wrong claim in round 4's report: the K3b email-normalisation
  checks DO exercise the real `payWithWallet` (only `finish` is stubbed
  there) — they survived the rebase because the new page-field fallback
  only fires on a missing wallet email, which no test token lacks.
  Re-ran every suite, all still green: google-pay 51, seam 30,
  wallet-common 28, paypal 13, subscribe-wallet 19, address 27, ga4 ALL
  PASS. Not yet committed.

Next: commit the round-5 test fix + this State update, report round 5 to
the overseer. Not landing — Martin's call. Leave `## Agentic review` and
any Verdict line for the overseer.

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
