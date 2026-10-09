#!/usr/bin/env node
// Proves G1-G5 under "init() — assets/wallet-google-pay.js" in docs/specs/modules/wallets.md,
// without a real browser and without ever reaching Google or Recurly. Input: a directory holding
// checkout.html, assets/wallet-common.js and assets/wallet-google-pay.js (either this repo, or a
// scratch copy of some other commit made with `git archive`). Output: one PASS/FAIL line per
// check below, and a process exit code (0 only if every check passed). Exists so the change from
// "there is no Google Pay button at all" (red, on origin/main, where neither file exists) to
// "Google Pay mounts only when its switch and a merchant id are both present, posts through the
// shared wallet seam, and never breaks the card path" (green, on this branch) is provable from a
// fresh shell, not just asserted in prose.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: test-wallet-google-pay.mjs <dir>');
  process.exit(2);
}

let failCount = 0;
// Input: a human-readable label and whether the thing it describes held true. Output: none;
// prints PASS or FAIL and remembers failures so the script's own exit code can report them.
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failCount++;
}

// Input: the raw text of one HTML page. Output: an array of { src, code } in document order — src
// set for an external <script src="...">, code set (and src null) for an inline <script>...</script>
// — plus that same HTML with every <script>...</script> removed. Why: JSDOM does not fetch local
// files for a script's src, and this test must not touch the real network either, so every
// script's actual code is read here and run by hand, in the order the page itself would run it.
function extractScripts(html) {
  const scripts = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return whole; // JSON-LD and similar: not code, leave it in the page untouched
    }
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    scripts.push(srcMatch ? { src: srcMatch[1], code: null } : { src: null, code: body });
    return '';
  });
  return { scripts, stripped };
}

// Input: checkout.html's own file name, a plan code for the URL, a stub for window.recurly (or
// null), whether window.PaymentRequest should exist, and two switches this test needs to force
// because the shipped files ship them off — forceGooglePayOn flips wallet-common.js's
// `google_pay: false` to `true`, forceMerchantId replaces wallet-google-pay.js's
// `GOOGLE_MERCHANT_ID = ''` with a test value. Output: the JSDOM `window` after every local
// <script> on checkout.html ran, in order, exactly as authored, plus a synchronous dispatch of
// DOMContentLoaded (jsdom's own one, from a document already fully parsed before any script ran,
// cannot be relied on to land after this test's own assertions, so this fires it itself, once).
function loadCheckout(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(dir, 'checkout.html'), 'utf8');
  const { scripts, stripped } = extractScripts(html);
  const plan = opts.plan || 'half-year';
  const dom = new JSDOM(stripped, { url: 'https://leskobusiness.com/checkout?plan=' + plan, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__scriptErrors = [];
  window.fetch = function () { return Promise.reject(new Error('no network in this test')); };
  window.Element.prototype.scrollIntoView = function () {};
  if (opts.hasPaymentRequest !== false) window.PaymentRequest = function () {};
  if (opts.recurlyStub) window.recurly = opts.recurlyStub;

  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue; // external CDN scripts (Recurly) — not local, not needed
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
      if (s.src === '/assets/wallet-common.js' && opts.forceGooglePayOn) {
        const line = /google_pay:\s*false/;
        if (!line.test(code)) throw new Error('could not find "google_pay: false" in ' + s.src);
        code = code.replace(line, 'google_pay: true');
      }
      if (s.src === '/assets/wallet-google-pay.js' && opts.forceMerchantId !== undefined) {
        const line = /GOOGLE_MERCHANT_ID = '[^']*'/;
        if (!line.test(code)) throw new Error('could not find GOOGLE_MERCHANT_ID in ' + s.src);
        code = code.replace(line, "GOOGLE_MERCHANT_ID = '" + opts.forceMerchantId + "'");
      }
    } else {
      code = s.code;
    }
    try {
      window.eval(code);
    } catch (e) {
      window.__scriptErrors.push(e); // one block's error must not stop the next <script> tag, same as a real browser
    }
  }
  // Every wallet file waits for DOMContentLoaded before mounting anything; dispatching it once,
  // synchronously, here is what actually runs their init() for this test to inspect.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  return window;
}

// Input: a stub recurly.GooglePay call recorder. Output: { recurlyStub, calls, lastInstance } —
// calls records every options object GooglePay() was called with; lastInstance is the fake
// GooglePay instance (attach/on/token/error) the most recent call returned, so a test can fire
// its 'token' or 'error' handlers by hand.
function makeRecurlyStub(behavior) {
  const calls = [];
  let lastInstance = null;
  const recurlyStub = {
    GooglePay: function (options) {
      calls.push(options);
      if (behavior === 'throw') throw new Error('Google Pay is not available');
      const handlers = {};
      lastInstance = {
        attach: function () {},
        on: function (event, cb) { handlers[event] = cb; },
        fireToken: function (token) { handlers.token && handlers.token(token); },
        fireError: function (err) { handlers.error && handlers.error(err); }
      };
      return lastInstance;
    }
  };
  return { recurlyStub, calls, get lastInstance() { return lastInstance; } };
}

// ── G1: off by default, and still off when switched on with no merchant id ─────────────────────
(function () {
  const offStub = makeRecurlyStub();
  const w1 = loadCheckout({ recurlyStub: offStub.recurlyStub });
  check('wallet-google-pay.js: switch off (as shipped) -> recurly.GooglePay is never called', offStub.calls.length === 0);
  check('wallet-google-pay.js: switch off (as shipped) -> #wallets stays empty', w1.document.getElementById('wallets').children.length === 0);

  const onEmptyIdStub = makeRecurlyStub();
  const w2 = loadCheckout({ recurlyStub: onEmptyIdStub.recurlyStub, forceGooglePayOn: true });
  check('wallet-google-pay.js: switch on but GOOGLE_MERCHANT_ID empty (as shipped) -> recurly.GooglePay is never called', onEmptyIdStub.calls.length === 0);
  check('wallet-google-pay.js: switch on but GOOGLE_MERCHANT_ID empty (as shipped) -> #wallets stays empty', w2.document.getElementById('wallets').children.length === 0);
})();

// ── G2: switch on, a merchant id -> one button, with the exact options, total() per plan ───────
(function () {
  const plans = { 'monthly': '29.95', 'half-year': '89.95', 'yearly': '149.95' };
  Object.keys(plans).forEach(function (plan) {
    const stub = makeRecurlyStub();
    const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123', plan: plan });
    check('wallet-google-pay.js: switch on + merchant id (' + plan + ') -> recurly.GooglePay is called exactly once', stub.calls.length === 1);
    const opts = stub.calls[0] || {};
    check('wallet-google-pay.js: ' + plan + ' -> total matches that plan\'s price', opts.total === plans[plan]);
    check('wallet-google-pay.js: ' + plan + ' -> currency is USD', opts.currency === 'USD');
    check('wallet-google-pay.js: ' + plan + ' -> country is US', opts.country === 'US');
    check('wallet-google-pay.js: ' + plan + ' -> googleMerchantId is the configured id', opts.googleMerchantId === 'merchant-test-123');
    check('wallet-google-pay.js: ' + plan + ' -> billingAddressRequired is true', opts.billingAddressRequired === true);
    check('wallet-google-pay.js: ' + plan + ' -> requireEmail is true', opts.requireEmail === true);
    check('wallet-google-pay.js: ' + plan + ' -> one button is mounted into #wallets', w.document.getElementById('wallets').children.length === 1);
  });
})();

// ── G3: an approved sheet calls payWithWallet with the exact arguments ──────────────────────────
(function () {
  const stub = makeRecurlyStub();
  const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  const calls = [];
  w.LeskoWallets.payWithWallet = function () { calls.push(Array.prototype.slice.call(arguments)); };
  stub.lastInstance.fireToken({ id: 'tok-gp-1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace' });
  check('wallet-google-pay.js: an approved sheet calls payWithWallet exactly once', calls.length === 1);
  const args = calls[0] || [];
  check('wallet-google-pay.js: payWithWallet is called with method "google_pay"', args[0] === 'google_pay');
  check('wallet-google-pay.js: payWithWallet is called with the token id', args[1] === 'tok-gp-1');
  check('wallet-google-pay.js: payWithWallet is called with the billing contact\'s email/first/last name',
    args[2] && args[2].email === 'ada@example.com' && args[2].first_name === 'Ada' && args[2].last_name === 'Lovelace');

  const calls2 = [];
  w.LeskoWallets.payWithWallet = function () { calls2.push(Array.prototype.slice.call(arguments)); };
  stub.lastInstance.fireToken({ id: 'tok-gp-2' }); // no email/name at all: a sheet can omit either
  check('wallet-google-pay.js: a token with no email/name still calls payWithWallet, each defaulting to \'\'',
    calls2.length === 1 && calls2[0][2].email === '' && calls2[0][2].first_name === '' && calls2[0][2].last_name === '');
})();

// ── G4: Google Pay unavailable (GooglePay() throws, or no window.PaymentRequest) ────────────────
(function () {
  const throwStub = makeRecurlyStub('throw');
  const w = loadCheckout({ recurlyStub: throwStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  check('wallet-google-pay.js: recurly.GooglePay() throwing leaves #wallets empty, not an error', w.document.getElementById('wallets').children.length === 0);
  check('wallet-google-pay.js: recurly.GooglePay() throwing does not stop the rest of the page\'s scripts running',
    w.document.getElementById('payBtn') !== null && typeof w.LeskoCheckout.plan === 'function');

  const noPrStub = makeRecurlyStub();
  const w2 = loadCheckout({ recurlyStub: noPrStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123', hasPaymentRequest: false });
  check('wallet-google-pay.js: no window.PaymentRequest -> recurly.GooglePay is never even called', noPrStub.calls.length === 0);
  check('wallet-google-pay.js: no window.PaymentRequest -> #wallets stays empty', w2.document.getElementById('wallets').children.length === 0);

  const errStub = makeRecurlyStub();
  const w3 = loadCheckout({ recurlyStub: errStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  check('wallet-google-pay.js: mounted first, before its own error event', w3.document.getElementById('wallets').children.length === 1);
  errStub.lastInstance.fireError(new Error('sheet was dismissed'));
  check('wallet-google-pay.js: on its own error event, the button is removed', w3.document.getElementById('wallets').children.length === 0);
  check('wallet-google-pay.js: on its own error event, #payMsg stays untouched (the card path error box is not a wallet\'s to use for this)',
    !w3.document.getElementById('payMsg').classList.contains('show'));
})();

process.exit(failCount > 0 ? 1 : 0);
