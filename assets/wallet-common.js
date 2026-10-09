// ──────────── Shared wallet seam — used by wallet-paypal.js, wallet-apple-pay.js and
// wallet-google-pay.js on checkout.html ────────────
// One on/off switch per wallet method, and the one function that turns an approved wallet sheet
// into the same purchase the card form makes. Written here because branch wallet-paypal, which
// owns this file per docs/specs/modules/wallets.md (C1-C6), had not landed on main when
// wallet-google-pay needed it to exist — see that spec's signatures, which this file follows
// exactly, and the wallet-google-pay brief's Context for the note back to the overseer.
window.LeskoWallets = (function () {
  // C1: the only switch. A method stays unreachable — no button mounted, no wallet SDK call, no
  // network call — until its flag here is true. All three ship false: Recurly's gateway for Lesko
  // is Authorize.Net-only and none of the three can be proven live yet (see
  // docs/specs/modules/wallets.md, Decisions, 2026-10-09).
  var WALLETS = { paypal: false, apple_pay: false, google_pay: false };

  // Input: a wallet method name. Output: whether a buyer may reach it right now.
  function isOn(method) {
    return WALLETS[method] === true;
  }

  // Input: a method name ('paypal', 'apple_pay', 'google_pay'). Output: the word that names it in
  // an error message or a GA4 event, so the two never drift apart from each other.
  function walletLabel(method) {
    if (method === 'paypal') return 'PayPal';
    if (method === 'apple_pay') return 'Apple Pay';
    if (method === 'google_pay') return 'Google Pay';
    return 'that wallet';
  }

  // Input: the wallet method that was used, the Recurly token id the wallet produced, and the
  // buyer's details as the wallet reported them ({email, first_name, last_name}, any possibly
  // empty). Output: none directly; posts the purchase to /api/subscribe exactly as the card path
  // does (plus `wallet: method`) and hands the parsed answer to window.LeskoCheckout.finish(), so
  // there is exactly one success path and one error box on this page no matter how the buyer paid.
  function payWithWallet(method, token, buyer) {
    var checkout = window.LeskoCheckout;
    if (!checkout) return; // C6: inert on a page that never published the seam

    // K3b: normalised once, here, before it reaches the C3 check, the GA4 event, the POST body
    // and finish() — the same trim/lowercase checkout.html's own subscribe() applies to the card
    // form's email, so a wallet and a card purchase by the same person make one Recurly account
    // code, not two that differ only in case.
    var email = ((buyer && buyer.email) || '').trim().toLowerCase();
    if (!email) {
      // C3: Recurly's account code is the email the buyer typed or the wallet reported; a
      // purchase with none cannot be built, so this never reaches the network at all.
      checkout.showError('We did not get an email address back from ' + walletLabel(method) + '. Please pay by card instead.');
      return;
    }

    var plan = checkout.plan();
    var price = checkout.total();
    // C4: the wallet's own GA4 event, told apart from the card path (payment_type "Credit Card")
    // by payment_type here.
    if (window.LeskoAnalytics && typeof window.LeskoAnalytics.track === 'function') {
      window.LeskoAnalytics.track('add_payment_info', {
        currency: 'USD',
        value: price,
        payment_type: walletLabel(method),
        items: [{ item_id: plan, item_name: plan, price: price, quantity: 1 }]
      });
    }

    var body = {
      plan: plan,
      token: token,
      email: email,
      first_name: (buyer && buyer.first_name) || '',
      last_name: (buyer && buyer.last_name) || '',
      company: '',
      wallet: method
    };

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      // C2/K3a/K3b: finish needs the original token (its 3DS branch re-submits beside it) and the
      // buyer's email (the card form's own #email input, which finish reads otherwise, is empty
      // for a wallet buyer who never typed into it).
      .then(function (result) { checkout.finish(result, token, email); })
      .catch(function () {
        // C5: a wallet token is single use; nothing here retries it.
        checkout.showError('The payment did not go through. Please check your card details and try again.');
      });
  }

  return { WALLETS: WALLETS, isOn: isOn, payWithWallet: payWithWallet };
})();
