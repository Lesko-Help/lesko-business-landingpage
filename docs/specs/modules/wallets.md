# wallets
Status: draft
Kind: helper
Summary: PayPal, Apple Pay and Google Pay on `/checkout`: one shared wallet seam plus one small file per method, every method off by default
Part of: `docs/specs/INDEX.md` · Deploy: push to `main` (Cloudflare Workers Builds) · Updated: 2026-10-09
Reads: the Recurly public key `checkout.html` already fetched from `/api/config`; Recurly.js v4's `recurly.PayPal()`, `recurly.ApplePay()` and `recurly.GooglePay()`.
Writes: `POST /api/subscribe` with a wallet token in place of a card token; nothing else of its own.

## Overview

*What it is for:* let a buyer on `/checkout` pay with PayPal, Apple Pay or Google Pay instead of typing a card, on the same page and the same purchase call.
*What it owns:* `assets/wallet-common.js`, `assets/wallet-paypal.js`, `assets/wallet-apple-pay.js`, `assets/wallet-google-pay.js`, the `#wallets` row in `checkout.html`, and the file `/.well-known/apple-developer-merchantid-domain-association`.
*What it depends on:* Recurly.js v4; the `worker` module's wallet branch in `/api/subscribe` (W1); and a Recurly gateway that actually supports each method — **none is in place on 2026-10-09**, see Decisions.
*Public entry points:* `window.LeskoCheckout` (published by `checkout.html`), `window.LeskoWallets.payWithWallet(method, token, buyer)` and `isOn(method)`, and one `init()` per method file.
*Not in scope:* the card form, the address rules and the page's look (`page`); the Recurly purchase itself (`worker`); provisioning and email (lesko-provisioning); every gateway, Apple Developer and Google Pay console setting, none of which a Claude session can reach.
*Secrets:* none of its own. The Recurly public key comes from `/api/config`; the Google merchant id and the Apple merchant id are public identifiers and are typed in the clear.
*Personal data:* each wallet hands back the buyer's email and, when the sheet is asked for it, first and last name. They travel to Recurly exactly as the typed ones do (`worker` B1) and are never logged.

Used by: `checkout.html`.

## Functions

### LeskoCheckout — the seam `checkout.html` publishes

*Signature:* `window.LeskoCheckout = { plan(), total(), showError(message), finish(result, tokenId, buyerEmail), walletsRow(), onReady(callback) }` — set by `checkout.html`'s inline script once the plan is known, before any wallet file runs.

*What it does:*
- K1: `plan()` returns the active plan key (`monthly`, `half-year` or `yearly`, the same fallback the card path uses) and `total()` its displayed total as a plain number of USD, e.g. `29.95` — a wallet sheet needs the amount, not the `$29.95` string.
- K2: `showError(message)` is the one the card path already uses: it fills the red `#payMsg` box and scrolls to it. A wallet never writes to the DOM itself.
- K3: `finish(result, tokenId, buyerEmail)` is the one the card path already uses, with one argument added for wallets. On `ok` it saves `{email, company, plan, t}` in `localStorage` and goes to `/welcome?email=…&plan=…`; on `three_d_secure_action_token_id` it opens `recurly.Risk().ThreeDSecure()` and re-submits with `subscribe(tokenId, …)`; otherwise it calls `showError`. A wallet reuses it, so there is exactly one success path and one 3-D Secure path on the page.
  - K3a: `tokenId` is **not** optional. The 3-D Secure branch re-submits the *original* payment token beside the bank's result token, so a caller that omits it posts `undefined` the one time the bank was willing to approve. A wallet passes the token id it just handed to `payWithWallet`.
  - K3c (open gap, recorded 2026-10-12, overseer review of `wallet-paypal`): the 3-D Secure branch is **card-only**, even though every wallet goes through it. It re-enters `checkout.html`'s own `subscribe()`, which builds a card-shaped body — no `wallet` field, and the name and email read back off `#email`/`#first_name`/`#last_name`. So a wallet buyer who never typed a name would be answered by the Worker's 400 "Please enter your first and last name." at the one moment the bank was willing to approve, on a token that is single use. Doubly unreachable today: no wallet switch is on, and the hand-back cannot fire at all (worker.md, 2026-10-09 open defect — S4 reads `err.three_d_secure_action_token_id` where Recurly v3 nests it under `error.transaction_error`). Both belong to the 3DS task, not to a wallet branch: whoever fixes the hand-back must fix the retry in the same worktree, or fixing one turns a silent dead branch into a live broken one. A wallet branch only carries a comment at the seam saying so.
  - K3b: `buyerEmail` exists because `finish` otherwise reads the email from the **card form's own input** (`var email = document.getElementById('email')`). A wallet buyer never types there, so without this argument a wallet purchase reaches `/welcome?email=&plan=…` with the address empty — and `/welcome` fires the GA4 `purchase` event while lesko-provisioning keys on that address. `checkout.html` reads `(buyerEmail || email.value).trim().toLowerCase()` — the normalising applies to **both** sources, and `payWithWallet` normalises the same way once before it posts, so the address in Recurly's account code, in `localStorage` and in the `/welcome` link is always the same string. Why it is spelled out: the card path has always trimmed and lower-cased (in `subscribe()` and in `finish()`), and a wallet that reports `Buyer@Example.COM` would otherwise open a second Recurly account for a buyer who already has `buyer@example.com` — and lesko-provisioning keys on that address. The card path passes no third argument, so it behaves exactly as before.
- K4: `walletsRow()` returns the `#wallets` element, or `null` when the markup is missing — a wallet file that cannot find its row does nothing rather than throwing.
- K6: `onReady(callback)` runs `callback` once `recurly.configure()` has succeeded, immediately if it already has. A wallet file mounts **only** from inside it. Why it is not optional: `checkout.html` configures Recurly only after its async `fetch('/api/config')` answers, which is later than `DOMContentLoaded`; a wallet file that mounts on `DOMContentLoaded` calls `recurly.GooglePay()` (or `PayPal()`, or `ApplePay()`) against an unconfigured `recurly`, which throws — and every wallet file catches that throw by design, so the button silently never appears and no error is logged anywhere.
  Two ordering rules make K6 safe, both found the hard way in `wallet-paypal`'s review (2026-10-12), where breaking them killed the card checkout silently the moment a wallet switch was flipped:
  - `checkout.html` marks itself ready **last** — after `recurly.Elements()` and after `card.attach('#recurly-card')`, not between `recurly.configure()` and them. The callbacks run synchronously inside that function, so anything they do happens before whatever follows the call.
  - the seam wraps **each** callback in its own `try`/`catch`. A wallet file that throws must not stop the card field attaching, must not stop the next wallet file, and must not reach `checkout.html`'s `fetch('/api/config')` chain, whose `.catch` is empty and would swallow it without a trace. A wallet file still catches its own throws as well (P4/G4/A4); this is the backstop for the one it misses.
- K5: publishing this seam changes no card behaviour. `checkout.html` keeps its no-op `window.LeskoAnalytics` stand-in and its existing submit handler; the inline functions are assigned to `window.LeskoCheckout` instead of being renamed or moved.

*Examples:* on `/checkout?plan=yearly` -> `plan() === 'yearly'`, `total() === 149.95`. With the card form's email box holding `a@b.co`, `finish({ok:true}, 'tok-1')` -> `location.href === '/welcome?email=a%40b.co&plan=yearly'`. With that box empty, as it is for every wallet buyer, `finish({ok:true}, 'tok-1', 'w@b.co')` -> `/welcome?email=w%40b.co&plan=yearly`, and `finish({ok:true}, 'tok-1')` -> `/welcome?email=&plan=yearly`, which is the bug K3b exists to stop.

*Inputs:* the page URL and the `PLANS` table already in `checkout.html`. *Outputs:* the six functions above on `window`.

*Errors:* none surfaced; a missing `#wallets` row is K4's `null`.

*Test:* `scripts/test-wallet-seam.sh .` — jsdom loads the real `checkout.html` with Recurly.js stubbed, and checks K1–K6: the six functions exist, `plan()`/`total()` for all three plans and for a junk `?plan=`, `showError` fills `#payMsg`, `finish({ok:true,…})` sets the `/welcome` URL and the `localStorage` key, the card submit path still reaches the token call, **`finish({ok:true},'tok-1','w@b.co')` with the card email box empty puts `w%40b.co` in the `/welcome` URL and in `localStorage`** (K3b), **the 3-D Secure branch re-submits with the `tokenId` it was given, not `undefined`** (K3a), and **`onReady` fires only after `recurly.configure()`, fires immediately when called afterwards, and — with a wallet switch on and a wallet SDK constructor stubbed to throw — the card field is still attached and the throw never escapes** (K6). That last check is the one the first review of `wallet-paypal` missed: proving a callback fires says nothing about what fires after it. Red first against `origin/main` (`window.LeskoCheckout` is undefined there).

### payWithWallet(method, token, buyer) / isOn(method) — `assets/wallet-common.js`

*Signature:* `window.LeskoWallets = { payWithWallet(method, token, buyer), isOn(method), WALLETS }`. `method` is one of `paypal`, `apple_pay`, `google_pay`; `token` is the Recurly token id the wallet produced; `buyer` is `{email, first_name, last_name}` as the wallet reported it, any of them possibly empty.

*What it does:*
- C1: `WALLETS = { paypal: false, apple_pay: false, google_pay: false }` sits at the top of the file and is the only switch. `isOn(method)` returns its flag; a method whose flag is `false` mounts no button, loads no wallet SDK and makes no network call, exactly as `GA4_MEASUREMENT_ID = ''` switches analytics off. **All three ship `false`** until Martin's gateway work is done and one real purchase has gone through on that method.
- C2: `payWithWallet` POSTs the same JSON body the card path posts — `{plan, token, email, first_name, last_name, company}` — plus `wallet: method`, to `/api/subscribe`, and hands the parsed answer straight to `LeskoCheckout.finish(result, token, buyer.email)` — both extra arguments always, per K3a and K3b. There is no second route and no second success path.
- C3: the buyer's details are resolved **wallet first, then the page's own fields**: `(buyer.email || document.getElementById('email').value)`, the same for `first_name` and `last_name`, each trimmed (and the email lower-cased) exactly as K3b pins it; `company` has no wallet source at all and is read straight off `#company`. Only when the result is still empty is the purchase refused before the POST, with `showError("We did not get an email address back from <wallet>. Please pay by card instead.")` — Recurly's account code is the email (`worker` B1), so a purchase without one cannot be built. Why the fallback, amended 2026-10-09: on this one-step page `#email`, `#first_name` and `#last_name` are `required` fields in panel 1 ("Your details") and the wallet button sits in the summary panel below them, so by the time a buyer clicks it they have almost always typed their address already. Whether Recurly's own `token` event carries an email is **unverified for all three methods** — there is no wallet-capable gateway on this site to test against (see Decisions) — so a wallet-only read would refuse every purchase on the day a gateway is switched on, with the address sitting in the form unread. The wallet's own address still wins when it gives one, because that is the account the buyer actually paid from. The refusal stays reachable: the wallet button is `type="button"`, so it bypasses the form's HTML validation and a buyer can click it with every field empty — which is also why `worker` W1 keeps the names optional.
- C4: before the POST it sends GA4 `add_payment_info` through `window.LeskoAnalytics.track()` with the plan, the USD price and `payment_type` set to `PayPal`, `Apple Pay` or `Google Pay`, so a wallet purchase is told apart from a card one in GA4. For that to work the **card** path must name itself too: `checkout.html`'s own `add_payment_info` sends `payment_type: 'Credit Card'`. Until `wallet-paypal` it sent no `payment_type` at all, and GA4 invents no default for a missing parameter (amended 2026-10-12, overseer review of `wallet-paypal`, which had asserted the opposite in a code comment) — so without this every card purchase would land in GA4 with the field blank and only wallet purchases would be labelled, which is not a comparison.
- C5: a network failure or a non-JSON answer calls `showError` with the card path's generic sentence ("The payment did not go through…"); nothing is retried, because a wallet token is single use.
- C6: the file is inert when loaded on a page that has no `window.LeskoCheckout` — it defines its functions and does nothing else, so `index.html` or `welcome.html` could load it harmlessly.

*Examples:* `payWithWallet('paypal', 'tok-1', {email:'a@b.co'})` on `?plan=monthly` -> `POST /api/subscribe {"plan":"monthly","token":"tok-1","email":"a@b.co","wallet":"paypal",…}` -> `finish()` -> `/welcome?email=a%40b.co&plan=monthly`. The same call with `{email:''}` -> no POST at all, and the `#payMsg` box names PayPal.

*Inputs:* `WALLETS`, the three arguments, `window.LeskoCheckout`, `window.LeskoAnalytics`. *Outputs:* one `fetch` to `/api/subscribe`, one GA4 event, and whatever `finish()` does.

*Errors:* every failure is shown in `#payMsg`; nothing is alerted from the browser. A decline is alerted server-side by `worker` S5, which now also records which wallet it was (W2).

*Test:* `node scripts/test-wallet-common.js assets/wallet-common.js` — loads the file in a `vm` with a stubbed `fetch`, `LeskoCheckout` and `LeskoAnalytics`: C1 (all three flags are `false` **in the file as shipped**, and `isOn` reports them), C2 (the exact POST body, including `wallet`), C3 (no POST and the named error on an empty email), C4 (one `add_payment_info` with the right `payment_type`), C5 (a rejected `fetch` shows the generic sentence and posts once), C6 (no throw without `LeskoCheckout`). Red first against `origin/main` (the file does not exist there).

### init() — `assets/wallet-paypal.js`

*Signature:* `assets/wallet-paypal.js`, loaded by `checkout.html` with `defer`; it runs its own `init()` on `DOMContentLoaded`.

*What it does:*
- P1: returns at once unless `LeskoWallets.isOn('paypal')` and `LeskoCheckout.walletsRow()` are both true — no PayPal SDK is fetched when the switch is off.
- P2: creates `recurly.PayPal({ gatewayCode: PAYPAL_GATEWAY_CODE })` once and mounts one button into `#wallets`, labelled "Pay with PayPal".
- P3: on the element's `token` event it calls `LeskoWallets.payWithWallet('paypal', token.id, {email: token.email, first_name: '', last_name: ''})`. PayPal's token carries an email but no reliable name, so the names go empty and `worker` W1 accepts that.
- P4: on the element's `error` or `cancel` event it calls `LeskoCheckout.showError()` with PayPal's own message, or stays silent on a plain cancel (the buyer closing the PayPal window is not an error).
- P5: `PAYPAL_GATEWAY_CODE` is a constant at the top of the file, empty by default. Recurly needs it only when a site has more than one gateway that can take PayPal; while it is empty Recurly picks the site's PayPal gateway itself.

*Examples:* switch off -> `#wallets` stays empty and `recurly.PayPal` is never called; switch on, `token` event with `{id:'tok-pp', email:'a@b.co'}` -> one POST with `"wallet":"paypal"` and empty names.

*Inputs:* `recurly` (already configured by `checkout.html`), the switch. *Outputs:* one button; one `payWithWallet` call per completed PayPal flow.

*Errors:* every PayPal failure ends in `#payMsg`; a cancel shows nothing.

*Test:* `scripts/test-wallet-paypal.sh .` — jsdom loads `checkout.html` with a stub `recurly` whose `PayPal()` records its options and lets the test fire `token`, `error` and `cancel`: P1 (off -> `recurly.PayPal` not called, `#wallets` empty), P2, P3 (the exact `payWithWallet` arguments), P4 (error shows, cancel is silent). Red first against `origin/main`.

### init() — `assets/wallet-google-pay.js`

*Signature:* `assets/wallet-google-pay.js`, loaded by `checkout.html` with `defer`; `init()` on `DOMContentLoaded`.

*What it does:*
- G1: returns at once unless `LeskoWallets.isOn('google_pay')`, `LeskoCheckout.walletsRow()` and a non-empty `GOOGLE_MERCHANT_ID` are all true.
- G2: creates `recurly.GooglePay({ currency: 'USD', country: 'US', total: String(LeskoCheckout.total()), googleMerchantId: GOOGLE_MERCHANT_ID, billingAddressRequired: true, requireEmail: true })` and mounts its button into `#wallets`. `total` comes from the seam, so the sheet can never show a price the page does not.
- G3: on the `token` event it calls `payWithWallet('google_pay', token.id, buyer)` with the email and the given/family name taken from the sheet's billing contact, each defaulting to `''`.
- G4: on `error`, or when Google Pay is unavailable in the browser (`recurly.GooglePay` throwing, or no `PaymentRequest`), it removes its own button and shows nothing — an unavailable wallet is not an error the buyer caused.
- G5: `GOOGLE_MERCHANT_ID` is a constant at the top of the file, empty by default, and Google requires 3-D Secure to be enabled on the gateway behind it (see Decisions).

*Examples:* Chrome with the switch on and a merchant id -> one Google Pay button; Safari, or an empty merchant id -> no button and no console error.

*Inputs:* `recurly`, the switch, `GOOGLE_MERCHANT_ID`, `LeskoCheckout.total()`. *Outputs:* one button; one `payWithWallet` call per approved sheet.

*Errors:* all silent or in `#payMsg`; never a thrown error that stops the card path.

*Test:* `scripts/test-wallet-google-pay.sh .` — jsdom with a stub `recurly.GooglePay` that records its options: G1 (off, and on-with-empty-merchant-id, both mount nothing), G2 (`total` equals the plan's price for all three plans, `currency`/`country`/`billingAddressRequired` as written), G3 (the exact `payWithWallet` arguments from a stub billing contact), G4 (a throwing `GooglePay()` leaves the page usable and the card path working). Red first against `origin/main`.

### init() — `assets/wallet-apple-pay.js`

*Signature:* `assets/wallet-apple-pay.js`, loaded by `checkout.html` with `defer`; `init()` on `DOMContentLoaded`.

*What it does:*
- A1: returns at once unless `LeskoWallets.isOn('apple_pay')`, `LeskoCheckout.walletsRow()` and `window.ApplePaySession && ApplePaySession.canMakePayments()` are all true — on a non-Apple browser nothing is mounted and nothing is logged.
- A2: creates `recurly.ApplePay({ country: 'US', currency: 'USD', total: String(LeskoCheckout.total()), requiredBillingContactFields: ['postalAddress','name','email'] })` and mounts its button into `#wallets`.
- A3: on the `token` event it calls `payWithWallet('apple_pay', token.id, buyer)` with the email and the given/family name from the billing contact, each defaulting to `''`.
- A4: on `error` it removes its own button and shows nothing, for the same reason as G4.
- A5: Apple Pay only works on a domain Apple has verified, so the repo carries `/.well-known/apple-developer-merchantid-domain-association` — the file Recurly supplies. It is **deliberately not** listed in `.assetsignore` (every other non-page file is), because `leskobusiness.com` must serve it; a landing is not done until `curl -s -o /dev/null -w '%{http_code}' https://leskobusiness.com/.well-known/apple-developer-merchantid-domain-association` prints 200 and the body matches the file in the repo.

*Examples:* Safari on a Mac with the switch on and the domain verified -> one Apple Pay button; Chrome, or the switch off -> no button, no error.

*Inputs:* `recurly`, the switch, `ApplePaySession`, `LeskoCheckout.total()`. *Outputs:* one button; one `payWithWallet` call per approved sheet; one public `.well-known` file.

*Errors:* all silent or in `#payMsg`.

*Test:* `scripts/test-wallet-apple-pay.sh .` — jsdom with a stub `recurly.ApplePay` and a stub `ApplePaySession`: A1 (off, and no `ApplePaySession`, both mount nothing), A2 (the options, `total` per plan), A3 (the `payWithWallet` arguments), A4. Plus `scripts/test-applepay-domain-file.sh .`: the `.well-known` file exists, is non-empty, and **no line of `.assetsignore` matches it** — red first against a copy of `.assetsignore` with `.well-known/` added, which is the mistake that would silently break Apple Pay.

### subscribe() — the wallet branch in `worker.js`

*Signature:* unchanged — `async function subscribe(request, env)`. This section records only what the wallet work adds; `worker` S1–S5 and B1–B3 otherwise stand.

*What it does:*
- W1: S3's validation gains one branch. When the body has no `wallet`, nothing changes: `plan`, `token`, `email`, `first_name` and `last_name` are all required. When `wallet` is one of `paypal`, `apple_pay`, `google_pay`, then `plan`, `token` and `email` are required and the two names are optional, because a wallet sheet does not always return them and the billing info Recurly needs rides on the token. A `wallet` value that is not one of the three is a 400, so the branch cannot be reached with junk.
- W2: `logDecline()` prints `wallet=<method|card>` as a fourth field of the existing `BTB_ALERT … PAYMENT_DECLINED` line. Why: a decline on a wallet and a decline on a card need completely different fixes, and the alert line is the only place a decline is visible to us.
- W3: `buildPurchase()` keeps B2 exactly — **a wallet token is still the only key in `billing_info`**, with no `ip_address` and no other sibling — and extends B3: `first_name` and `last_name` are set on the account only when non-empty, as `company` already is.
- W4: nothing else changes. No new route, no second rate limit, no change to `/api/config`; a wallet purchase is the same `POST /purchases` with the same API version.

*Examples:* `POST {plan:'monthly', token:'tok-pp', email:'a@b.co', wallet:'paypal'}` -> 201, and the Recurly account has a code and an email but no name. The same body without `wallet` -> 400 "Please fill in your first name."

*Inputs:* the JSON body, now with an optional `wallet`. *Outputs:* unchanged statuses.

*Errors:* unchanged, plus the wider decline line of W2.

*Test:* `node scripts/test-subscribe-wallet.js worker.js` — W1 (the three accepted `wallet` values pass without names; a fourth value is rejected; a body with no `wallet` and no names is still rejected), W3 (the built payload's `billing_info` has exactly one key, `token_id`, for every wallet, and the names are absent rather than empty strings), W2 (the alert line carries `wallet=paypal`, and still carries neither `te.message` nor any email). Red first against `origin/main`.

## Decisions

- 2026-10-09 (overseer draft, **not yet agreed by Martin**): all three methods go behind one `WALLETS` switch in `assets/wallet-common.js`, shipping `false`. Why: `main` is production, and not one of the three can be proven before Martin has done gateway work that no Claude session can reach. Code that cannot be tested live must not be reachable by a buyer.
- 2026-10-09: **the gateway behind Recurly blocks all three today.** Recurly for Lesko is Authorize.Net-only. Recurly's own documentation lists Apple Pay as supported through Adyen, Stripe, Braintree, Vantiv, Worldpay, Commerce Hub, Checkout.com, Chase Orbital, Nuvei and CyberSource — **Authorize.Net is not among them**. Google Pay needs the configured gateway to be enabled for Google Pay, a Google merchant id and 3-D Secure on the gateway; Authorize.Net is not named there either. PayPal is the one with a path that needs no banned gateway: Recurly takes PayPal through a **PayPal Complete Payments** gateway of its own, alongside the card gateway, rather than through Braintree or Stripe — but the PayPal gateway currently on the Recurly site is the dead legacy one (4 transactions, all failed at $0, checked 2026-06-16 and again 2026-09-25). Stripe is banned for Lesko. So each method needs admin work in Recurly first: **PayPal** a new PayPal Complete Payments gateway; **Google Pay** a gateway that supports it plus a Google merchant id; **Apple Pay** a supported gateway, an Apple Developer account, a Recurly Support feature flag, two certificates from Recurly-supplied CSRs, and the verified domain.
- 2026-10-09: the methods are written as one file each on top of one shared seam, not as three copies of a checkout. Why: three worktrees each editing `checkout.html`'s inline script would collide on every line, and Giulia pushes copy changes to `main` several times a day on top of them.
- 2026-10-09 (amended the same day, after reviewing `wallet-google-pay`): the seam's `finish` is `finish(result, tokenId, buyerEmail)`, not `finish(result)`, and wallets mount through `onReady`. Why: the first draft of this spec read `checkout.html` wrongly twice. `finish` really takes the original token id, which its 3-D Secure branch re-submits; and it reads the buyer's email off the **card form's input**, which a wallet buyer never fills — so a wallet purchase would have sent the buyer to `/welcome?email=` and broken both the GA4 `purchase` event and lesko-provisioning's key. Both worktrees had built the wrong signature faithfully. The draft's own Example claimed `finish` reads `result.account_code`; it does not.
- 2026-10-09: the `#wallets` row's markup and placement are `wallet-paypal`'s, because it owns the seam. `wallet-google-pay` shipped its own copy of the row and of `wallet-common.js` — correctly, its brief told it to while `wallet-paypal` had landed nothing — but put the row in the payment panel above `#cardField` rather than the summary panel above `#payMsg`. Whichever lands second drops its copy; one copy of each file ever exists on `main`.
- 2026-10-09: a wallet reuses the card path's `finish()` and `#payMsg` rather than its own success and error handling. Why: there is exactly one way to reach `/welcome` and one place a buyer reads a failure, so a wallet cannot drift away from the card path.
- 2026-10-09 (open, for the lesko-checkout overseer): a wallet purchase's Recurly transaction origin is unknown. The card route shows as **Recurly.js** in the dashboard (not `hpp`, not `api`); a wallet purchase may show something else again, and any Dataform model that filters on origin goes blind on a value it has never seen.
