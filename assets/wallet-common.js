// ──────────── Wallet seam, shared by every wallet method (docs/specs/modules/wallets.md C1-C6) ────────────
// One switch, one POST, one success path — assets/wallet-paypal.js (and any later wallet-apple-pay.js /
// wallet-google-pay.js) call window.LeskoWallets.payWithWallet() instead of each building its own
// network call, so a wallet purchase always lands on /checkout's own finish() and #payMsg, exactly like
// the card path does. Loaded by checkout.html with `defer`, before the per-method files.
window.LeskoWallets = (function () {
  // Input: nothing — a method name below reads this directly. Output: whether a buyer can ever reach
  // that method's button. All three start `false` (DECISION, docs/specs/modules/wallets.md, 2026-10-09):
  // the Recurly gateway behind this site cannot take any of them live yet, so code that cannot be
  // proven with a real purchase must not be reachable by a buyer. A method file still loads and defines
  // its functions with its flag `false` — it just mounts nothing (C1).
  var WALLETS = { paypal: false, apple_pay: false, google_pay: false };

  var WALLET_LABELS = { paypal: 'PayPal', apple_pay: 'Apple Pay', google_pay: 'Google Pay' };

  // Input: one of 'paypal' / 'apple_pay' / 'google_pay'. Output: whether that method's switch is on.
  function isOn(method) {
    return !!WALLETS[method];
  }

  // Input: the wallet method name, the Recurly token id it produced, and the buyer details it reported
  // ({email, first_name, last_name}, any possibly empty — a wallet does not always return a name).
  // Output: none directly; as a side effect, either shows a named error (no network call, C3), or POSTs
  // to /api/subscribe and hands the answer to the page's own LeskoCheckout.finish() (C2) — exactly the
  // one success/error path the card form already uses, so a wallet purchase can never drift onto a
  // second route.
  function payWithWallet(method, token, buyer) {
    buyer = buyer || {};
    var label = WALLET_LABELS[method] || method;
    // Normalised once, here, before the empty check below and before it reaches the GA4 event, the
    // POST body or finish() — the same trim/lower-case the card path's own subscribe() already
    // applies (K3b amendment, 2026-10-09), so a wallet reporting `Buyer@Example.COM` resolves to the
    // same Recurly account code and the same lesko-provisioning key as the lower-cased address.
    var email = (buyer.email || '').trim().toLowerCase();

    // C3: Recurly's account code is the email (worker B1) — a purchase cannot be built without one,
    // so this is the one check made before any network call, naming the wallet in the message.
    if (!email) {
      window.LeskoCheckout.showError('We did not get an email address back from ' + label + '. Please pay by card instead.');
      return;
    }

    var plan = window.LeskoCheckout.plan();
    var price = (window.LeskoAnalytics && window.LeskoAnalytics.planPriceUSD) ? window.LeskoAnalytics.planPriceUSD(plan) : undefined;

    // C4: the same add_payment_info shape the card path sends, so the two are told apart in GA4 only
    // by payment_type — the card path's own event (checkout.html) is untouched and keeps none set,
    // which GA4 reads as its default, Credit Card.
    if (window.LeskoAnalytics && window.LeskoAnalytics.track) {
      window.LeskoAnalytics.track('add_payment_info', {
        currency: 'USD',
        value: price,
        payment_type: label,
        items: [{ item_id: plan, item_name: plan, price: price, quantity: 1 }]
      });
    }

    // The business-name field is page-level, not something any wallet sheet reports, so it is read
    // straight off the form — the same field and the same trim the card path's own subscribe() uses.
    var companyField = document.getElementById('company');

    var body = {
      plan: plan,
      token: token,
      email: email,
      first_name: buyer.first_name || '',
      last_name: buyer.last_name || '',
      company: companyField ? companyField.value.trim() : '',
      wallet: method
    };

    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (result) {
        // K3a/K3b: both extra arguments always — the token this call just spent, and the email the
        // wallet reported, since a wallet buyer never fills the card form's own #email field.
        window.LeskoCheckout.finish(result, token, email);
      })
      .catch(function () {
        // C5: a wallet token is single use, so nothing here is retried — the same generic sentence
        // the card path's own finish() shows for a server-side failure.
        window.LeskoCheckout.showError('The payment did not go through. Please check your card details and try again.');
      });
  }

  return {
    WALLETS: WALLETS,
    isOn: isOn,
    payWithWallet: payWithWallet
  };
})();
