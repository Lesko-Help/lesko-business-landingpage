// ──────────── Google Pay on /checkout — docs/specs/modules/wallets.md, G1-G5 ────────────
// Mounts one Google Pay button into checkout.html's #wallets row, and hands every approved sheet
// to the shared wallet seam (assets/wallet-common.js), exactly as PayPal and Apple Pay do. Ships
// switched off: GOOGLE_MERCHANT_ID is empty and WALLETS.google_pay is false in wallet-common.js,
// so nothing here is reachable by a buyer until Martin has put a Google-Pay-capable gateway and a
// merchant id behind Recurly (see that spec's Decisions, 2026-10-09).
(function () {
  // G5: a constant at the top of the file, empty by default. Google also requires 3-D Secure to
  // be turned on for the gateway behind this merchant id — Martin's to arrange, not this file's.
  var GOOGLE_MERCHANT_ID = '';

  // Input: nothing (reads the page's own globals). Output: none; mounts a Google Pay button into
  // #wallets when, and only when, the switch, the row and a merchant id are all present — run
  // once, on DOMContentLoaded, same as every other wallet file.
  function init() {
    var wallets = window.LeskoWallets;
    var checkout = window.LeskoCheckout;
    // G1: off unless the switch, the seam's #wallets row and a merchant id all exist.
    if (!wallets || !checkout || !wallets.isOn('google_pay')) return;
    var row = checkout.walletsRow();
    if (!row || !GOOGLE_MERCHANT_ID) return;
    if (!window.PaymentRequest) return; // G4: no PaymentRequest API, same silent no-op as below

    var googlePay;
    try {
      // G2: total() comes from the seam, so the sheet can never show a price the page does not.
      googlePay = recurly.GooglePay({
        currency: 'USD',
        country: 'US',
        total: String(checkout.total()),
        googleMerchantId: GOOGLE_MERCHANT_ID,
        billingAddressRequired: true,
        requireEmail: true
      });
    } catch (e) {
      // G4: Google Pay unavailable in this browser is not an error the buyer caused.
      return;
    }

    var button = document.createElement('div');
    row.appendChild(button);
    googlePay.attach(button);

    googlePay.on('token', function (token) {
      // G3: Recurly's wallet tokens carry the sheet's billing contact as top-level fields, the
      // same place PayPal's token carries its email (wallets.md, P3) — each defaults to '' when
      // the sheet did not return it.
      wallets.payWithWallet('google_pay', token.id, {
        email: token.email || '',
        first_name: token.firstName || '',
        last_name: token.lastName || ''
      });
    });

    googlePay.on('error', function () {
      // G4: remove the button and show nothing — the card path stays fully usable.
      if (button.parentNode) button.parentNode.removeChild(button);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
