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
- 2026-10-12: `docs/specs/modules/wallets.md` is now committed on `origin/main`
  (the overseer's `2dc3d75`, pulled into this branch by the round-5 merge) —
  read it normally, `git show origin/main:docs/specs/modules/wallets.md` or
  straight off disk in this tree. It was only ever the overseer's own
  uncommitted file before that commit; this line is the correction.
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

## Agentic review

### Verdict
Verdict: pass — fifth round. Rounds 1-3 were approved per round and not
landed; round 4 was the rebase onto the landed `wallet-paypal` seam; round 5
fixed the one real gap this review found. Everything is fixed, and re-proved
by the overseer rather than taken on the worker's report.

Reviewed by the overseer (window 1) on 2026-10-12 against `origin/main` at
`450d13f`, with `git add -N .` first and `git diff origin/main...HEAD`: 5
files, +560/-2, tree clean. 51 checks in the google-pay suite, 0 FAIL, re-run
by the overseer itself on the final committed tree, plus the ten neighbouring
suites green (seam 30, wallet-common 28, paypal 13, subscribe-wallet 19,
address 27, ga4 all pass, raillog 3, decline-alert 8, decline-email 10,
build-purchase 7). `scripts/test-subscribe-rate-limit.sh` was deliberately
**not** run — see the Traps above; it cannot be trusted at the moment and no
branch is judged on it.

### Findings

Round 4 (2026-10-12), the overseer's own review of the rebased branch:

- **The one real finding — the suite could not tell whether the switch
  existed.** `scripts/test-wallet-google-pay.mjs` has two independent knobs,
  `forceGooglePayOn` and `forceMerchantId`, and every case that set a
  merchant id also flipped the switch on; the only switch-off case left the
  merchant id empty. So the empty-merchant-id guard, not
  `wallets.isOn('google_pay')`, was what kept the button unmounted. Proved by
  deleting `wallets.isOn('google_pay')` from `init()`: all 49 checks stayed
  green. It matters at exactly one moment — the day Martin fills in a real
  merchant id and the switch becomes the only thing holding the button back.
- Verified, not faulted: the rebase took the landed seam wholesale instead of
  hand-merging. `assets/wallet-common.js` is byte-identical to `origin/main`
  (`cmp`), and `checkout.html` differs from landed only by the one
  `<script src>` line and the comment widened to name three files.
- Accepted without a red proof: the `recurly.GooglePay(...)` →
  `window.recurly.GooglePay(...)` rename. `window` is the script global in
  both the browser and the jsdom harness, so there is no behaviour to prove;
  the worktree saying so rather than inventing a red run was the right call.
- Accepted as-is, checked rather than assumed: the file's top-level
  `onReady(init)` shape. The inline `<script>` in `checkout.html` that
  publishes `window.LeskoCheckout` is not deferred, so it runs during
  parsing — before the deferred wallet files — and `onReady` therefore
  exists by the time this file runs. The `if (window.LeskoCheckout)` guard
  covers the case where it does not.
- Not this branch's: the inherited comment in the landed seam that still
  says DOMContentLoaded. The landed file's to fix.

**One finding withdrawn by the overseer.** I first reported that the K3b
email-normalisation checks were not exercising the real code, on the strength
of a probe that removed the string `.trim().toLowerCase();` — which does not
occur in the landed `wallet-common.js`, where the two calls sit on separate
lines (46 and 52). The probe changed nothing, so its green result meant
nothing. Re-done against the real line: 2 checks red here and 5 in
`test-wallet-common.js`. The coverage is genuine. The worktree's own first
explanation of why those checks survive the rebase was wrong too — it said
they stub `payWithWallet`, and they do not; only `finish` is stubbed. The real
reason is that the page-field fallback fires only on a missing wallet email,
and every test token supplies one. Corrected in State.

Clean: nothing logs, mails or posts a key, token, card datum or buyer email;
nothing is reachable by a buyer while `WALLETS.google_pay` is `false` and
`GOOGLE_MERCHANT_ID` is `''`; `.assetsignore` needs no new line (`scripts/`
is covered wholesale, `assets/*` is meant to serve); the live card path is
untouched.

### Fixed in

- The switch-coverage gap — `a1007c4`: one case added, merchant id forced and
  the switch left off, asserting zero `recurly.GooglePay` calls and an empty
  `#wallets` row. **Red-proved by the overseer, not only by the worker:**
  deleting `wallets.isOn('google_pay')` from `init()` now fails exactly those
  two checks and leaves the other 49 green, exit 1; put back, 51/51 PASS,
  exit 0.
- The brief's own State, and the K3b correction — `bb17996`.

Still Martin's, and the reason this cannot go live whatever the verdict says:
Recurly here is Authorize.Net-only, which Recurly does not list as a Google
Pay gateway. Google Pay also needs a merchant id (`GOOGLE_MERCHANT_ID`, empty
in the file) and 3-D Secure switched on for that gateway. Until all three
exist the switch cannot be flipped, and this branch ships inert by design.
