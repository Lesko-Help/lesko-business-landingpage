// ──────────── PayPal, straight into PayPal (docs/specs/modules/wallets.md P1-P9, K7) ────────────
// The buyer pays inside PayPal with PayPal's own JS SDK; the subscription is created there against
// one of three PayPal billing plans in Lesko's own PayPal merchant account (product
// PROD-25B93089XF9559540), not the ClickFunnels plans, which answer 404 for our credentials and must
// never be wired in again (spec P2). Recurly is not involved and our Worker sees nothing: no POST /api/subscribe. Access is
// granted by lesko-provisioning off PayPal's own webhook.
//
// Loaded by checkout.html with `defer`, after wallet-common.js. Runs its own init() on
// DOMContentLoaded. It does not wait for LeskoCheckout.onReady(): that is about Recurly being
// configured, and PayPal does not use Recurly at all.
//
// Wrapped in its own IIFE so its names stay private and cannot be overwritten by the next wallet
// file (overseer review, 2026-10-12).
(function () {
  // P3: the PayPal REST *client id* of Lesko's own PayPal merchant account. It is PayPal's public
  // browser id, meant to be visible in the page; the matching secret never goes in this repo.
  // Read from the `paypal-client-id` secret in project lesko-486515 (2026-10-17).
  var PAYPAL_CLIENT_ID = 'ARTrRs67UuT2GSadXtlhLA6Q2JTpDSNHJQBvj0NdIeBOSEHbv7IST2eClJwe0D7rpsBMpcYkTYuxXnvN';

  // P2: ?plan= -> PayPal billing plan id. All three are ACTIVE plans on product
  // PROD-25B93089XF9559540 in Lesko's OWN PayPal account (checked 2026-10-17), not copied from
  // ClickFunnels. The old ids belonged to another merchant and answered 404.
  var PAYPAL_PLAN_IDS = {
    'monthly': 'P-7R176589BE0160805NLJVCFI',    // $29.95 every 1 MONTH
    'half-year': 'P-2GV64945HR320740CNLIP2HY',  // $89.95 every 6 MONTH
    'yearly': 'P-8M862053KT491162FNLJVCFI'      // $149.95 every 1 YEAR
  };

  // How long we are willing to wait for PayPal to tell us the buyer's email address before giving
  // up and finishing the order without it (P6). The money is already taken by the time we ask, so
  // this wait can never be allowed to strand the buyer on a spinning page.
  //
  // 1 s, cut from 4 s on 2026-10-23. This number is a double-charge window, not just a delay: for
  // as long as it runs, the page shows nothing new while a PayPal subscription already exists AND
  // the card "Pay" button is still enabled, so a buyer who sees PayPal's window close and nothing
  // happen can start a SECOND subscription on the Recurly rail. The proper fix is to show a
  // "payment received" state before the lookup, which needs `busy` exposed on the seam in
  // checkout.html; until that lands this is the cheap half of it.
  // What it costs: a PayPal call slower than this falls back to the typed address, or to '' when
  // the box was empty, so /welcome prints a placeholder instead of the real login. That is a
  // display loss, where the thing it buys back is a second charge — never the other way round.
  var EMAIL_LOOKUP_MS = 1000;

  // Input: nothing. Output: the buyer's typed email, trimmed and lower-cased exactly as the card
  // path and K3b do ('' when empty). Why: it is the fallback for /welcome when PayPal will not tell
  // us the address itself.
  function typedEmail() {
    var box = document.getElementById('email');
    return box ? box.value.trim().toLowerCase() : '';
  }

  // Input: PayPal's own `actions` object from onApprove. Output: a promise for the email address on
  // the subscription PayPal just created, lower-cased — or '' when PayPal does not say.
  // Why it exists (P6): this is the address lesko-provisioning actually grants Mighty Networks
  // access to, because it reads `subscriber.email_address` off PayPal's webhook and never sees what
  // was typed here. So it is the only address /welcome can honestly print as "your login".
  // Why it never rejects and never throws: it is called after the buyer has paid, where losing the
  // order would be far worse than losing a display value (P7, the ENG-4226 lesson). Every failure
  // path — no `get` in this SDK version, a rejected call, a thrown call, or one that simply never
  // answers — resolves '' instead, and the caller falls back to the typed address.
  function paypalEmail(actions) {
    var get = actions && actions.subscription && actions.subscription.get;
    if (typeof get !== 'function') return Promise.resolve('');
    return new Promise(function (resolve) {
      var settled = false;
      // Input: the address to report. Output: none; resolves once and only once, whichever of the
      // call and the timeout gets there first.
      var settle = function (address) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(address);
      };
      var timer = setTimeout(function () { settle(''); }, EMAIL_LOOKUP_MS);
      try {
        Promise.resolve(actions.subscription.get()).then(function (subscription) {
          var subscriber = subscription && subscription.subscriber;
          var address = subscriber && subscriber.email_address;
          settle(address ? String(address).trim().toLowerCase() : '');
        }, function () { settle(''); });
      } catch (e) {
        settle('');
      }
    });
  }

  // Input: a GA4 event name, the plan key, and optionally extra params (e.g. { reason: ... }).
  // Output: none; sends the event with the one shared wallet shape (currency, value, payment_type,
  // items — the same as add_payment_info) through window.LeskoAnalytics.track. Why: the button click,
  // the refused click, the cancel and the error must all look alike in GA4, and a broken or blocked
  // analytics file must never stop the buyer paying, so any failure here is swallowed.
  function trackWalletEvent(name, plan, extra) {
    try {
      var total = window.LeskoCheckout.total();
      var params = {
        currency: 'USD',
        value: total,
        payment_type: 'PayPal',
        items: [{ item_id: plan, item_name: plan, price: total, quantity: 1 }]
      };
      for (var key in extra) params[key] = extra[key];
      window.LeskoAnalytics.track(name, params);
    } catch (e) { /* analytics is optional */ }
  }

  // Input: the plan key and its PayPal plan id. Output: none; renders one PayPal button into
  // #wallets. Why: called only once PayPal's SDK has finished loading (P3). Every failure goes to
  // #payMsg, never window.alert (P7).
  function renderButton(plan, planId) {
    var row = window.LeskoCheckout.walletsRow();
    if (!row || !window.paypal) return;

    window.paypal.Buttons({
      style: { layout: 'vertical', label: 'subscribe' },

      // P9: every click is counted, and the click is never refused (P6, changed 2026-10-23). An
      // empty email box used to reject the click here; it rejected two clicks in five and bought
      // nothing, because the address it was collecting is not the one access is granted to — see
      // paypalEmail().
      onClick: function () {
        trackWalletEvent('wallet_click', plan);
      },

      // P4: the one thing PayPal needs — create the subscription on this plan, nothing else.
      createSubscription: function (data, actions) {
        return actions.subscription.create({ plan_id: planId });
      },

      // P5 + K7: the subscription is already live in PayPal here. Ask PayPal which address it is
      // billing (P6), tell GA4, then reuse the page's own success path with PayPal's subscription id
      // where a Recurly token id would go.
      // Input: PayPal's onApprove data and actions. Output: a promise that settles once the buyer has
      // been sent to /welcome. The email handed to finish() is PayPal's own address when PayPal gives
      // one, otherwise whatever was typed, otherwise '' — and /welcome already prints a placeholder
      // for that last case. Why in this order: provisioning grants Mighty Networks access to
      // PayPal's address, so printing any other one on /welcome tells the buyer a login that will
      // not work.
      onApprove: function (data, actions) {
        var subscriptionId = data && data.subscriptionID;
        if (!subscriptionId) {
          // P7 (the ClickFunnels page's ENG-4226 lesson): a failure AFTER approval must never
          // silently lose the order.
          window.LeskoCheckout.showError('We could not confirm your PayPal payment. If you were charged, contact support before trying again.');
          return;
        }
        return paypalEmail(actions).then(function (paypalAddress) {
          // Analytics can never hold up a paid order, so its failure is swallowed here rather than
          // reaching the catch below (the same rule as trackWalletEvent, spec C7).
          try {
            window.LeskoAnalytics.track('add_payment_info', {
              currency: 'USD',
              value: window.LeskoCheckout.total(),
              payment_type: 'PayPal',
              items: [{ item_id: plan, item_name: plan, price: window.LeskoCheckout.total(), quantity: 1 }]
            });
          } catch (e) { /* analytics is optional */ }
          try {
            window.LeskoCheckout.finish({ ok: true }, subscriptionId, paypalAddress || typedEmail());
          } catch (e) {
            window.LeskoCheckout.showError('We could not confirm your PayPal payment. If you were charged, contact support before trying again.');
          }
        });
      },

      // P7: a real failure is shown; the card form above stays usable.
      onError: function () {
        trackWalletEvent('wallet_error', plan); // P9: no error text is sent to Google
        window.LeskoCheckout.showError('PayPal did not go through. Please try again or pay by card instead.');
      },

      // P7: the buyer closing PayPal's window is not an error, so nothing is shown. P9: it is counted.
      onCancel: function () { trackWalletEvent('wallet_cancel', plan); }
    }).render(row);
  }

  // Input: nothing (reads LeskoWallets, LeskoCheckout, ?plan=, PAYPAL_CLIENT_ID). Output: none; as a
  // side effect either does nothing (P1/P3: switch off, no #wallets row, no client id, or a plan
  // PayPal has no plan for — and then no PayPal script is fetched at all) or adds PayPal's SDK
  // script once and renders the button when it loads (P3, P8).
  function init() {
    if (!window.LeskoWallets || !window.LeskoWallets.isOn('paypal')) return;
    if (!window.LeskoCheckout || !window.LeskoCheckout.walletsRow()) return;
    var plan = window.LeskoCheckout.plan();
    var planId = PAYPAL_PLAN_IDS[plan];
    if (!planId || !PAYPAL_CLIENT_ID) return;

    var script = document.createElement('script');
    // P3 + P8: subscription intent with vaulting, USD, buttons only; card funding off because our
    // own card field sits right above this button.
    script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(PAYPAL_CLIENT_ID) +
      '&vault=true&intent=subscription&currency=USD&components=buttons&disable-funding=card';
    script.onload = function () { renderButton(plan, planId); };
    // A blocked or failed SDK means no PayPal button, silently — the card path is untouched.
    script.onerror = function () { if (script.parentNode) script.parentNode.removeChild(script); };
    document.head.appendChild(script);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
