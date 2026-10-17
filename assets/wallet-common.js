// ──────────── Wallet seam, shared by every wallet method (docs/specs/modules/wallets.md C1-C6) ────────────
// One switch, one POST, one success path — assets/wallet-paypal.js (and any later wallet-apple-pay.js /
// wallet-google-pay.js) call window.LeskoWallets.payWithWallet() instead of each building its own
// network call, so a wallet purchase always lands on /checkout's own finish() and #payMsg, exactly like
// the card path does. Loaded by checkout.html with `defer`, before the per-method files.
window.LeskoWallets = (function () {
  // Input: nothing — a method name below reads this directly. Output: whether a buyer can ever reach
  // that method's button. All three started `false` (DECISION, docs/specs/modules/wallets.md, 2026-10-09; `paypal` switched on 2026-10-17 once its plans were live in our own account):
  // the Recurly gateway behind this site cannot take any of them live yet, so code that cannot be
  // proven with a real purchase must not be reachable by a buyer. A method file still loads and defines
  // its functions with its flag `false` — it just mounts nothing (C1).
  var WALLETS = { paypal: true, apple_pay: false, google_pay: false };

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
    var label = WALLET_LABELS[method] || method;

    // C3 amendment (2026-10-09, overseer review): #wallets sits below the required
    // #email/#first_name/#last_name fields in checkout.html's panel 1, so by the time a buyer
    // reaches a wallet button they have almost always already typed those in. A wallet's own
    // value still wins when it has one — it is the real payment-account address — but whether a
    // given wallet's token event carries an email at all is unverified on this site (no live
    // wallet-capable gateway to test against), so falling back to what the buyer already typed
    // beats refusing a purchase that a one-line gap in a wallet SDK made look dead. Normalised
    // once, here, before the empty check below and before it reaches the GA4 event, the POST body
    // or finish() — the same trim/lower-case the card path's own subscribe() already applies
    // (K3b amendment, 2026-10-09), so either source resolves to the same Recurly account code.
    var emailField = document.getElementById('email');
    var firstNameField = document.getElementById('first_name');
    var lastNameField = document.getElementById('last_name');
    // Each source is trimmed before the choice between wallet and page field is made, not after —
    // otherwise a wallet reporting a whitespace-only email would win the `||` over a good page
    // field, then still trip the empty check below and refuse a purchase the buyer could have made.
    var walletEmail = ((buyer && buyer.email) || '').trim();
    var fieldEmail = (emailField ? emailField.value : '').trim();
    var walletFirstName = ((buyer && buyer.first_name) || '').trim();
    var fieldFirstName = (firstNameField ? firstNameField.value : '').trim();
    var walletLastName = ((buyer && buyer.last_name) || '').trim();
    var fieldLastName = (lastNameField ? lastNameField.value : '').trim();
    var email = (walletEmail || fieldEmail).toLowerCase();
    var firstName = walletFirstName || fieldFirstName;
    var lastName = walletLastName || fieldLastName;

    // C3: Recurly's account code is the email (worker B1) — a purchase cannot be built without one
    // from either source, so this is the one check made before any network call, naming the wallet
    // in the message.
    if (!email) {
      window.LeskoCheckout.showError('We did not get an email address back from ' + label + '. Please pay by card instead.');
      return;
    }

    var plan = window.LeskoCheckout.plan();
    var price = (window.LeskoAnalytics && window.LeskoAnalytics.planPriceUSD) ? window.LeskoAnalytics.planPriceUSD(plan) : undefined;

    // C4: the same add_payment_info shape the card path sends, so the two are told apart in GA4 by
    // payment_type — the card path's own event (checkout.html) now sends 'Credit Card' explicitly
    // (overseer review, 2026-10-12: GA4 has no such default; left unset, a card purchase would be
    // merely blank, not distinguishable from any wallet's own label).
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
      first_name: firstName,
      last_name: lastName,
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
