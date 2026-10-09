#!/usr/bin/env node
// Proves G1-G5 under "init() — assets/wallet-google-pay.js" in docs/specs/modules/wallets.md,
// plus the two things the overseer's review of this file added to the seam (K6 onReady, K3a/K3b
// finish's extra arguments) — without a real browser and without ever reaching Google or Recurly.
// Input: a directory holding checkout.html, assets/wallet-common.js and
// assets/wallet-google-pay.js (either this repo, or a scratch copy of some other commit made with
// `git archive`). Output: one PASS/FAIL line per check below, and a process exit code (0 only if
// every check passed). Exists so the change from "there is no Google Pay button at all" (red, on
// origin/main, where neither file exists) to "Google Pay mounts only once Recurly is actually
// configured, posts through the shared wallet seam with the arguments finish() needs, and never
// breaks the card path" (green, on this branch) is provable from a fresh shell, not just asserted
// in prose.
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

// Input: the raw text of one HTML page. Output: an array of { src, code, defer } in document
// order — src set for an external <script src="...">, code set (and src null) for an inline
// <script>...</script>, defer true when the tag carries the defer attribute — plus that same HTML
// with every <script>...</script> removed. Why: JSDOM does not fetch local files for a script's
// src, and this test must not touch the real network either, so every script's actual code is
// read here and run by hand; defer is tracked because this page's two wallet files depend on
// running after checkout.html's own inline script, not merely after it in document order (see
// loadCheckout below).
function extractScripts(html) {
  const scripts = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return whole; // JSON-LD and similar: not code, leave it in the page untouched
    }
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const defer = /\bdefer\b/i.test(attrs);
    scripts.push(srcMatch ? { src: srcMatch[1], code: null, defer: defer } : { src: null, code: body, defer: defer });
    return '';
  });
  return { scripts, stripped };
}

// Input: checkout.html's own file name, a plan code for the URL, a stub for window.recurly (or
// null), whether window.PaymentRequest should exist, the result /api/subscribe should answer with,
// and two switches this test needs to force because the shipped files ship them off —
// forceGooglePayOn flips wallet-common.js's `google_pay: false` to `true`, forceMerchantId
// replaces wallet-google-pay.js's `GOOGLE_MERCHANT_ID = ''` with a test value. Output: the JSDOM
// `window` after every local <script> on checkout.html ran. Non-deferred scripts (the page's own
// inline script, which publishes window.LeskoCheckout) run first, deferred ones (wallet-common.js,
// wallet-google-pay.js) after — real browsers run deferred scripts only once the document has
// finished parsing, which is after an earlier inline script already ran, and a wallet file's own
// top-level `checkout.onReady(init)` call depends on LeskoCheckout already existing by then. The
// caller awaits flushMicrotasks() separately (same convention as scripts/test-checkout-address.mjs)
// to let the real /api/config -> recurly.configure() -> onReady chain settle before reading the
// result.
function loadCheckout(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(dir, 'checkout.html'), 'utf8');
  const { scripts, stripped } = extractScripts(html);
  const plan = opts.plan || 'half-year';
  const dom = new JSDOM(stripped, { url: 'https://leskobusiness.com/checkout?plan=' + plan, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__scriptErrors = [];
  window.fetch = function (url) {
    const u = String(url);
    if (u.indexOf('/api/config') !== -1) {
      return Promise.resolve({ json: function () { return Promise.resolve({ recurly_public_key: 'pk-test' }); } });
    }
    if (u.indexOf('/api/subscribe') !== -1) {
      return Promise.resolve({ json: function () { return Promise.resolve(opts.subscribeResult || { ok: true }); } });
    }
    return Promise.reject(new Error('no network in this test'));
  };
  window.Element.prototype.scrollIntoView = function () {};
  if (opts.hasPaymentRequest !== false) window.PaymentRequest = function () {};
  if (opts.recurlyStub) window.recurly = opts.recurlyStub;

  function runScripts(list) {
    for (const s of list) {
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
  }

  runScripts(scripts.filter(function (s) { return !s.defer; }));
  runScripts(scripts.filter(function (s) { return s.defer; }));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  return window;
}

// Input: nothing. Output: a promise that resolves once every microtask queued so far — including
// ones queued by callbacks those microtasks themselves queue — has run. Why: checkout.html reaches
// recurly.configure() only after fetch('/api/config') resolves, and a wallet file's onReady
// callback only fires after that — several microtask hops, not one (same helper and same reason as
// scripts/test-checkout-address.mjs).
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// Input: a behavior flag ('throw' makes recurly.GooglePay() throw; omitted is the normal path).
// Output: { recurlyStub, calls, lastInstance } — recurlyStub also stubs configure()/Elements() so
// checkout.html's own setupCard() succeeds and reaches onReady's fireReady(), which every test
// here needs regardless of what it is testing about Google Pay specifically; calls records every
// options object GooglePay() was called with; lastInstance is the fake GooglePay instance
// (attach/on/token/error) the most recent call returned, so a test can fire its 'token' or 'error'
// handlers by hand.
function makeRecurlyStub(behavior) {
  const calls = [];
  let lastInstance = null;
  const recurlyStub = {
    configure: function () {},
    Elements: function () {
      return { CardElement: function () { return { attach: function () {}, on: function () {} }; } };
    },
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
await (async function () {
  const offStub = makeRecurlyStub();
  const w1 = loadCheckout({ recurlyStub: offStub.recurlyStub });
  await flushMicrotasks();
  check('wallet-google-pay.js: switch off (as shipped) -> recurly.GooglePay is never called', offStub.calls.length === 0);
  check('wallet-google-pay.js: switch off (as shipped) -> #wallets stays empty', w1.document.getElementById('wallets').children.length === 0);

  const onEmptyIdStub = makeRecurlyStub();
  const w2 = loadCheckout({ recurlyStub: onEmptyIdStub.recurlyStub, forceGooglePayOn: true });
  await flushMicrotasks();
  check('wallet-google-pay.js: switch on but GOOGLE_MERCHANT_ID empty (as shipped) -> recurly.GooglePay is never called', onEmptyIdStub.calls.length === 0);
  check('wallet-google-pay.js: switch on but GOOGLE_MERCHANT_ID empty (as shipped) -> #wallets stays empty', w2.document.getElementById('wallets').children.length === 0);
})();

// ── G2: switch on, a merchant id -> one button, with the exact options, total() per plan ───────
await (async function () {
  const plans = { 'monthly': '29.95', 'half-year': '89.95', 'yearly': '149.95' };
  for (const plan of Object.keys(plans)) {
    const stub = makeRecurlyStub();
    const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123', plan: plan });
    await flushMicrotasks();
    check('wallet-google-pay.js: switch on + merchant id (' + plan + ') -> recurly.GooglePay is called exactly once', stub.calls.length === 1);
    const opts = stub.calls[0] || {};
    check('wallet-google-pay.js: ' + plan + ' -> total matches that plan\'s price', opts.total === plans[plan]);
    check('wallet-google-pay.js: ' + plan + ' -> currency is USD', opts.currency === 'USD');
    check('wallet-google-pay.js: ' + plan + ' -> country is US', opts.country === 'US');
    check('wallet-google-pay.js: ' + plan + ' -> googleMerchantId is the configured id', opts.googleMerchantId === 'merchant-test-123');
    check('wallet-google-pay.js: ' + plan + ' -> billingAddressRequired is true', opts.billingAddressRequired === true);
    check('wallet-google-pay.js: ' + plan + ' -> requireEmail is true', opts.requireEmail === true);
    check('wallet-google-pay.js: ' + plan + ' -> one button is mounted into #wallets', w.document.getElementById('wallets').children.length === 1);
  }
})();

// ── G3: an approved sheet calls payWithWallet with the exact arguments ──────────────────────────
await (async function () {
  const stub = makeRecurlyStub();
  const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  await flushMicrotasks();
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
await (async function () {
  const throwStub = makeRecurlyStub('throw');
  const w = loadCheckout({ recurlyStub: throwStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  await flushMicrotasks();
  check('wallet-google-pay.js: recurly.GooglePay() throwing leaves #wallets empty, not an error', w.document.getElementById('wallets').children.length === 0);
  check('wallet-google-pay.js: recurly.GooglePay() throwing does not stop the rest of the page\'s scripts running',
    w.document.getElementById('payBtn') !== null && typeof w.LeskoCheckout.plan === 'function');

  const noPrStub = makeRecurlyStub();
  const w2 = loadCheckout({ recurlyStub: noPrStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123', hasPaymentRequest: false });
  await flushMicrotasks();
  check('wallet-google-pay.js: no window.PaymentRequest -> recurly.GooglePay is never even called', noPrStub.calls.length === 0);
  check('wallet-google-pay.js: no window.PaymentRequest -> #wallets stays empty', w2.document.getElementById('wallets').children.length === 0);

  const errStub = makeRecurlyStub();
  const w3 = loadCheckout({ recurlyStub: errStub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  await flushMicrotasks();
  check('wallet-google-pay.js: mounted first, before its own error event', w3.document.getElementById('wallets').children.length === 1);
  errStub.lastInstance.fireError(new Error('sheet was dismissed'));
  check('wallet-google-pay.js: on its own error event, the button is removed', w3.document.getElementById('wallets').children.length === 0);
  check('wallet-google-pay.js: on its own error event, #payMsg stays untouched (the card path error box is not a wallet\'s to use for this)',
    !w3.document.getElementById('payMsg').classList.contains('show'));
})();

// ── K6 (seam, our dependency): mounts through onReady, not on page load ─────────────────────────
await (async function () {
  const stub = makeRecurlyStub();
  const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123' });
  // DOMContentLoaded has already fired (loadCheckout does that), but recurly.configure() has not
  // run yet — its /api/config fetch is still a pending promise at this exact point — so onReady's
  // callback must still be queued, not run.
  check('wallet-google-pay.js: before Recurly is configured, DOMContentLoaded alone does not mount anything', stub.calls.length === 0 && w.document.getElementById('wallets').children.length === 0);
  await flushMicrotasks();
  check('wallet-google-pay.js: once Recurly is configured (onReady fires), the button mounts', stub.calls.length === 1 && w.document.getElementById('wallets').children.length === 1);
})();

// ── K3a/K3b (seam, our dependency): payWithWallet reaches finish with the token id and the ───────
// wallet's own email, not the (empty, for a wallet buyer) card form email box ───────────────────
await (async function () {
  const stub = makeRecurlyStub();
  const w = loadCheckout({ recurlyStub: stub.recurlyStub, forceGooglePayOn: true, forceMerchantId: 'merchant-test-123', subscribeResult: { ok: true } });
  await flushMicrotasks();
  const finishCalls = [];
  w.LeskoCheckout.finish = function () { finishCalls.push(Array.prototype.slice.call(arguments)); };
  check('wallet-google-pay.js: the card form\'s own #email box is empty (a wallet buyer never typed into it)', w.document.getElementById('email').value === '');
  stub.lastInstance.fireToken({ id: 'tok-gp-3', email: 'wallet-buyer@example.com', firstName: 'Wally', lastName: 'Et' });
  await flushMicrotasks();
  check('wallet-google-pay.js: an approved sheet reaches checkout.finish exactly once', finishCalls.length === 1);
  const args = finishCalls[0] || [];
  check('wallet-google-pay.js: finish is called with the result from /api/subscribe', args[0] && args[0].ok === true);
  check('wallet-google-pay.js: finish is called with the original token id (its 3DS branch re-submits beside it, K3a)', args[1] === 'tok-gp-3');
  check('wallet-google-pay.js: finish is called with the wallet\'s own email as the third argument (K3b), not the empty card form field',
    args[2] === 'wallet-buyer@example.com');
})();

process.exit(failCount > 0 ? 1 : 0);
