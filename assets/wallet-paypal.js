// ──────────── PayPal, one of the wallet methods built on wallet-common.js (docs/specs/modules/wallets.md P1-P5) ────────────
// Loaded by checkout.html with `defer`, after wallet-common.js and before window.LeskoAnalytics's own
// script. Runs its own init() on DOMContentLoaded, same as any other deferred script — but mounting the
// actual PayPal button waits inside LeskoCheckout.onReady() (K6), since Recurly is only configured after
// the page's own async /api/config fetch resolves, which is later than DOMContentLoaded.

// P5: Recurly needs a gateway code only when a site has more than one gateway able to take PayPal; empty
// (the default) lets Recurly pick this site's own PayPal gateway by itself.
var PAYPAL_GATEWAY_CODE = '';

// Input: nothing (reads window.LeskoWallets/LeskoCheckout/recurly). Output: none directly; as a side
// effect, either mounts nothing (the switch is off, or #wallets is missing) or mounts one "Pay with
// PayPal" button and wires its events through to the shared seam. Exists so DOMContentLoaded can call it
// once and have it decide for itself, the same shape every wallet method file uses.
function init() {
  // P1: the switch and the row both have to be there before any PayPal SDK call is made at all —
  // checked again inside onReady below, since the switch could in principle still be read as off at
  // DOMContentLoaded time but that is also the first and only time it is checked today.
  if (!window.LeskoWallets || !window.LeskoWallets.isOn('paypal') || !window.LeskoCheckout || !window.LeskoCheckout.walletsRow()) return;

  window.LeskoCheckout.onReady(function () {
    var row = window.LeskoCheckout.walletsRow();
    if (!row || !window.recurly) return;

    // P2: one PayPal element, created once, mounted into #wallets as a single labelled button.
    var paypal = window.recurly.PayPal({ gatewayCode: PAYPAL_GATEWAY_CODE });
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Pay with PayPal';
    row.appendChild(button);
    button.addEventListener('click', function () { paypal.start(); });

    // P3: PayPal's own token carries an email but no reliable name, so both names go empty —
    // worker.js's wallet branch (W1) accepts that.
    paypal.on('token', function (token) {
      window.LeskoWallets.payWithWallet('paypal', token.id, { email: token.email, first_name: '', last_name: '' });
    });

    // P4: every real PayPal failure surfaces in #payMsg; a plain cancel (the buyer closing the
    // PayPal window themselves) is not an error and shows nothing.
    paypal.on('error', function (err) {
      window.LeskoCheckout.showError((err && err.message) || 'PayPal did not go through. Please pay by card instead.');
    });
    paypal.on('cancel', function () {});
  });
}

document.addEventListener('DOMContentLoaded', init);
