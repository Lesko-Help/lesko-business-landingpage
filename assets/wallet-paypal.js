// ──────────── PayPal, straight into PayPal (docs/specs/modules/wallets.md P1-P9, K7) ────────────
// The buyer pays inside PayPal with PayPal's own JS SDK; the subscription is created there against
// one of two PayPal billing plans Lesko already owns (the same ones the ClickFunnels order pages
// use). Recurly is not involved and our Worker sees nothing: no POST /api/subscribe. Access is
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

  // Marks the error we throw ourselves when the email is missing, so onError can tell it apart from
  // a real PayPal failure and not show a second message over the first.
  var MISSING_EMAIL = 'lesko-missing-email';

  // Input: nothing. Output: the buyer's typed email, trimmed and lower-cased exactly as the card
  // path and K3b do ('' when empty). Why: /welcome and the GA4 purchase event both read it.
  function typedEmail() {
    var box = document.getElementById('email');
    return box ? box.value.trim().toLowerCase() : '';
  }

  // Input: nothing. Output: true when an email is typed; otherwise false, after showing a named
  // error in #payMsg (P6). Why: one place for the check so onClick and createSubscription agree.
  function requireEmail() {
    if (typedEmail()) return true;
    window.LeskoCheckout.showError('Please type your email address above before paying with PayPal — we send your access there.');
    return false;
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

      // P9: every click is counted first (the denominator). P6: then refuse the click before PayPal's
      // window opens when no email is typed, and count that refusal on its own.
      onClick: function (data, actions) {
        trackWalletEvent('wallet_click', plan);
        if (!requireEmail()) {
          trackWalletEvent('wallet_click_refused', plan, { reason: 'missing_email' });
          return actions.reject();
        }
      },

      // P4: the one thing PayPal needs — create the subscription on this plan, nothing else.
      createSubscription: function (data, actions) {
        if (!requireEmail()) throw new Error(MISSING_EMAIL);
        return actions.subscription.create({ plan_id: planId });
      },

      // P5 + K7: the subscription is already live in PayPal here. Tell GA4, then reuse the page's own
      // success path with PayPal's subscription id where a Recurly token id would go.
      onApprove: function (data) {
        try {
          var subscriptionId = data && data.subscriptionID;
          if (!subscriptionId) throw new Error('no subscription id');
          window.LeskoAnalytics.track('add_payment_info', {
            currency: 'USD',
            value: window.LeskoCheckout.total(),
            payment_type: 'PayPal',
            items: [{ item_id: plan, item_name: plan, price: window.LeskoCheckout.total(), quantity: 1 }]
          });
          window.LeskoCheckout.finish({ ok: true }, subscriptionId, typedEmail());
        } catch (e) {
          // P7 (the ClickFunnels page's ENG-4226 lesson): a failure AFTER approval must never
          // silently lose the order.
          window.LeskoCheckout.showError('We could not confirm your PayPal payment. If you were charged, contact support before trying again.');
        }
      },

      // P7: a real failure is shown; the card form above stays usable.
      onError: function (err) {
        if (err && err.message === MISSING_EMAIL) return; // already counted as wallet_click_refused
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
