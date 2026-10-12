#!/usr/bin/env node
// Proves P1-P5 under "init() — assets/wallet-paypal.js" in docs/specs/modules/wallets.md, without
// a real browser or a real PayPal/Recurly SDK. Input: a directory holding checkout.html and
// assets/wallet-common.js + assets/wallet-paypal.js (this repo, or a scratch copy of some other
// commit made with `git archive`). Output: one PASS/FAIL line per check, and a process exit code
// (0 only if every check passed) — so red (origin/main has neither wallet file) and green (this
// branch) are each provable from a fresh shell.
//
// Mirrors scripts/test-wallet-seam.mjs's own jsdom harness, extended to also run the two
// `defer`-loaded wallet scripts (stripped out and eval'd by hand, in page order) and then fire a
// real `DOMContentLoaded`, since that is the event wallet-paypal.js's own init() waits for before
// deciding whether to mount anything at all.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: test-wallet-paypal.mjs <dir>');
  process.exit(2);
}

let failCount = 0;
// Input: a human-readable label and whether the thing it describes held true. Output: none;
// prints PASS or FAIL and remembers failures so the script's own exit code can report them.
function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (extra !== undefined && !ok ? ' (got ' + JSON.stringify(extra) + ')' : ''));
  if (!ok) failCount++;
}

// Input: the raw text of one HTML page. Output: an array of { src, code, defer } in document
// order, plus that HTML with every <script>...</script> removed. Unlike test-wallet-seam.mjs's
// own extractScripts, `defer` scripts are kept (flagged), not dropped — this test needs
// wallet-common.js and wallet-paypal.js to actually run.
function extractScripts(html) {
  const scripts = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return whole;
    }
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    scripts.push({
      src: srcMatch ? srcMatch[1] : null,
      code: srcMatch ? null : body,
      defer: /\bdefer\b/i.test(attrs)
    });
    return '';
  });
  return { scripts, stripped };
}

// Input: the URL to load checkout.html at, and an options object: `rewriteHtml` (for the K4-style
// "no #wallets row" case), `recurlyStub` (must include a `PayPal` function to be useful here) and
// `paypalOn` (flips WALLETS.paypal to true right after wallet-common.js runs, before
// DOMContentLoaded fires — the switch has to already be in its final state when wallet-paypal.js's
// own init() reads it). Output: the JSDOM `window`, with every local, non-deferred script run in
// page order, then every local deferred script run in page order, then a real `DOMContentLoaded`
// dispatched — mirroring a real browser's own ordering for `defer` scripts.
function loadCheckout(url, options) {
  options = options || {};
  let html = fs.readFileSync(path.join(dir, 'checkout.html'), 'utf8');
  if (options.rewriteHtml) html = options.rewriteHtml(html);
  const { scripts, stripped } = extractScripts(html);
  const dom = new JSDOM(stripped, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__scrollTargets = [];
  window.fetch = function (u) {
    if (options.configResponse && String(u).indexOf('/api/config') !== -1) {
      return Promise.resolve({ json: function () { return Promise.resolve(options.configResponse); } });
    }
    return Promise.reject(new Error('no network in this test'));
  };
  window.Element.prototype.scrollIntoView = function () { window.__scrollTargets.push(this); };
  if (options.recurlyStub) window.recurly = options.recurlyStub;

  const deferred = [];
  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue; // the real recurly.js CDN script — not needed here
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
    } else {
      code = s.code;
    }
    if (s.defer) { deferred.push(code); continue; }
    window.eval(code);
  }
  for (const code of deferred) window.eval(code);

  // jsdom fires its own real DOMContentLoaded once asynchronously, after this function returns
  // (its document is already fully parsed — the scripts were stripped out and run by hand above).
  // The switch has to be in its final state before that happens, since wallet-paypal.js's own
  // init() runs synchronously inside that one event and reads it then; setting it here, still
  // inside this synchronous function, is guaranteed to land before jsdom's event fires. (An
  // earlier draft also dispatched a second, manual DOMContentLoaded here — that fired init() a
  // second time, alongside jsdom's own, and so called recurly.PayPal() twice.)
  if (options.paypalOn && window.LeskoWallets) window.LeskoWallets.WALLETS.paypal = true;
  return window;
}

// Input: nothing. Output: a promise that resolves once every microtask queued so far has run —
// setupCard() (and so markReady()/onReady) only resolves after the stubbed /api/config fetch
// answers, a few microtask hops away from loadCheckout() returning.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// Input: a recurlyStub's captured PayPal() options/handlers object. Output: a fresh one, shared
// by reference between the stub and the test body below, so the test can fire the same `token` /
// `error` / `cancel` callbacks wallet-paypal.js itself registered.
function makeRecurlyStub(capture) {
  return {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; },
    Risk: function () { return {}; },
    PayPal: function (opts) {
      capture.options = opts;
      capture.calls = (capture.calls || 0) + 1;
      const handlers = {};
      capture.handlers = handlers;
      return {
        on: function (ev, cb) { handlers[ev] = cb; },
        start: function () {}
      };
    }
  };
}

// ── P1: the switch off -> #wallets stays empty and recurly.PayPal is never called ──────────────
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: false
  });
  await flushMicrotasks();
  check('switch off: recurly.PayPal is never called (P1)', capture.calls === undefined, capture.calls);
  const row = w.document.getElementById('wallets');
  check('switch off: #wallets stays empty (P1)', !!row && row.children.length === 0, row && row.innerHTML);
})();

// ── P1: the switch on but no #wallets row -> still no PayPal, no throw ──────────────────────────
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true,
    rewriteHtml: function (html) { return html.replace(/<div class="wallets" id="wallets"><\/div>/, ''); }
  });
  await flushMicrotasks();
  check('switch on, no #wallets row: recurly.PayPal is never called (P1)', capture.calls === undefined, capture.calls);
})();

// ── P2: switch on + #wallets present -> recurly.PayPal({gatewayCode}) called once, one button ──
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true
  });
  await flushMicrotasks();
  check('switch on: recurly.PayPal is created exactly once (P2)', capture.calls === 1, capture.calls);
  const row = w.document.getElementById('wallets');
  check('one button is mounted into #wallets (P2)', row.querySelectorAll('button').length === 1, row.innerHTML);
  check('the button is labelled "Pay with PayPal" (P2)', row.querySelector('button').textContent === 'Pay with PayPal', row.innerHTML);
  // ── P5: PAYPAL_GATEWAY_CODE is empty by default. ──
  check('recurly.PayPal is called with an empty gatewayCode by default (P5)', capture.options && capture.options.gatewayCode === '', JSON.stringify(capture.options));
})();

// ── P3: the token event calls payWithWallet('paypal', token.id, {email, first_name:'', last_name:''}) ──
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true
  });
  await flushMicrotasks();
  const payCalls = [];
  w.LeskoWallets.payWithWallet = function (method, token, buyer) { payCalls.push({ method: method, token: token, buyer: buyer }); };
  capture.handlers.token({ id: 'tok-pp', email: 'a@b.co' });
  check('the token event calls payWithWallet with method "paypal" and the token id (P3)',
    payCalls.length === 1 && payCalls[0].method === 'paypal' && payCalls[0].token === 'tok-pp', JSON.stringify(payCalls));
  check('the token event passes the PayPal email and empty names (P3)',
    payCalls.length === 1 && payCalls[0].buyer.email === 'a@b.co' && payCalls[0].buyer.first_name === '' && payCalls[0].buyer.last_name === '',
    JSON.stringify(payCalls));
})();

// ── P4: an error event shows PayPal's own message; a cancel event shows nothing ─────────────────
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true
  });
  await flushMicrotasks();
  const payMsg = w.document.getElementById('payMsg');
  capture.handlers.error({ message: 'PayPal declined this account.' });
  check('an error event shows PayPal\'s own message in #payMsg (P4)', payMsg.textContent.indexOf('PayPal declined this account.') !== -1, payMsg.textContent);
})();
await (async function () {
  const capture = {};
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: makeRecurlyStub(capture),
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true
  });
  await flushMicrotasks();
  const payMsg = w.document.getElementById('payMsg');
  capture.handlers.cancel();
  check('a cancel event shows nothing (P4)', !payMsg.classList.contains('show') && payMsg.textContent.trim() === '', payMsg.textContent);
})();

// ── Blocker fix (overseer review, 2026-10-12): a throwing recurly.PayPal() must not stop the card
// field from attaching, and must leave no button mounted ──────────────────────────────────────
await (async function () {
  const capture = {};
  const attachCalls = [];
  const stub = makeRecurlyStub(capture);
  stub.Elements = function () {
    return { CardElement: function () { return { attach: function (sel) { attachCalls.push(sel); }, on: function () {} }; } };
  };
  stub.PayPal = function () { throw new Error('this gateway cannot take PayPal'); };
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: stub,
    configResponse: { recurly_public_key: 'pk-test' },
    paypalOn: true
  });
  await flushMicrotasks();
  check('a throwing recurly.PayPal() still lets the card field attach (blocker fix)',
    attachCalls.length === 1 && attachCalls[0] === '#recurly-card', JSON.stringify(attachCalls));
  const row = w.document.getElementById('wallets');
  check('a throwing recurly.PayPal() mounts no button (blocker fix)',
    !!row && row.children.length === 0, row && row.innerHTML);
})();

process.exit(failCount > 0 ? 1 : 0);
