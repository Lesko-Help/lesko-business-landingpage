// ──────────── PayPal, straight into PayPal (docs/specs/modules/wallets.md P1-P8, K7) ────────────
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
  // P3: the PayPal REST *client id* (a public identifier, not the secret). Ships EMPTY, so the file
  // as shipped renders nothing — the same shape wallet-google-pay.js uses for its merchant id.
  // Martin fills it in when the PayPal side is ready.
  var PAYPAL_CLIENT_ID = '';

  // P2: ?plan= -> PayPal billing plan id, copied from the ClickFunnels order pages'
  // data-product-payment-gateway-plan-id. `half-year` is deliberately absent: PayPal has no
  // 6-month plan, so that plan stays card-only. `monthly` bills $19.95 on PayPal where the card
  // bills $29.95 — accepted by Martin 2026-10-17; do not point at a plan that does not exist.
  var PAYPAL_PLAN_IDS = {
    'monthly': 'P-7TV41146KY851263NROQAXEQ',
    'yearly': 'P-80J45642K6983362LS2OVYFQ'
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

  // Input: the plan key and its PayPal plan id. Output: none; renders one PayPal button into
  // #wallets. Why: called only once PayPal's SDK has finished loading (P3). Every failure goes to
  // #payMsg, never window.alert (P7).
  function renderButton(plan, planId) {
    var row = window.LeskoCheckout.walletsRow();
    if (!row || !window.paypal) return;

    window.paypal.Buttons({
      style: { layout: 'vertical', label: 'subscribe' },

      // P6: refuse the click before PayPal's window opens when no email is typed.
      onClick: function (data, actions) {
        if (!requireEmail()) return actions.reject();
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
        if (err && err.message === MISSING_EMAIL) return;
        window.LeskoCheckout.showError('PayPal did not go through. Please try again or pay by card instead.');
      },

      // P7: the buyer closing PayPal's window is not an error.
      onCancel: function () {}
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
