#!/usr/bin/env node
// Proves P1-P8 and K7 under "init() — assets/wallet-paypal.js" in docs/specs/modules/wallets.md
// (PayPal straight into PayPal, not through Recurly), without a real browser or a real PayPal SDK.
// Input: a directory holding checkout.html and assets/* (this repo, or a scratch copy of some other
// commit made with `git archive`). Output: one PASS/FAIL line per check, and an exit code (0 only if
// every check passed) — so red (origin/main still has the old Recurly-route file) and green (this
// branch) are each provable from a fresh shell.
//
// How the SDK is faked: wallet-paypal.js adds a <script src="https://www.paypal.com/sdk/js?…"> tag.
// jsdom never downloads it; the test reads the tag's URL, puts a stub `paypal` global on the window
// and calls the tag's onload by hand. The stub's Buttons() records its options so the test can drive
// createSubscription / onApprove / onError / onCancel exactly as PayPal's SDK would.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// jsdom does not implement `location.href = '...'` to another page; it logs "Not implemented" and
// leaves location unchanged. Same trick as test-wallet-seam.mjs: patch jsdom's own navigate() to
// record the attempted URL, before jsdom's Location class is first loaded.
const require = createRequire(import.meta.url);
const whatwgURL = require('whatwg-url');
const navigation = require(require.resolve('jsdom/lib/jsdom/living/window/navigation.js'));
let lastNavigatedTo = null;
navigation.navigate = function (window, newURL) {
  lastNavigatedTo = whatwgURL.serializeURL(newURL);
};
const { JSDOM } = require('jsdom');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: test-wallet-paypal.mjs <dir>');
  process.exit(2);
}

const MONTHLY_PLAN = 'P-7TV41146KY851263NROQAXEQ';
const YEARLY_PLAN = 'P-80J45642K6983362LS2OVYFQ';
const TEST_CLIENT_ID = 'test-client-id';

let failCount = 0;
// Input: a human-readable label and whether the thing it describes held true. Output: none;
// prints PASS or FAIL and remembers failures so the exit code can report them.
function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (extra !== undefined && !ok ? ' (got ' + JSON.stringify(extra) + ')' : ''));
  if (!ok) failCount++;
}

// Input: the raw text of one HTML page. Output: every runnable <script> in document order as
// { src, code, defer }, plus the HTML with them removed (the test runs them by hand, in order).
function extractScripts(html) {
  const scripts = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') return whole;
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    scripts.push({ src: srcMatch ? srcMatch[1] : null, code: srcMatch ? null : body, defer: /\bdefer\b/i.test(attrs) });
    return '';
  });
  return { scripts, stripped };
}

// Input: the URL to load checkout.html at and options: `clientId` (substituted for the empty
// PAYPAL_CLIENT_ID the file ships with — the substitution itself is asserted), `rewriteHtml` (edits the page text first), `paypalOn` (flips
// WALLETS.paypal after wallet-common.js ran, before DOMContentLoaded fires), `emailValue` (typed
// into #email). Output: the JSDOM window with every script run in page order (deferred ones last)
// and a log of fetch calls and of GA4 events on `window.__fetched` / `window.__events`. Recurly.js
// is a stub WITHOUT a PayPal() member, so any use of Recurly's PayPal throws and fails the test.
function loadCheckout(url, options) {
  options = options || {};
  let html = fs.readFileSync(path.join(dir, 'checkout.html'), 'utf8');
  if (options.rewriteHtml) html = options.rewriteHtml(html);
  const { scripts, stripped } = extractScripts(html);
  const dom = new JSDOM(stripped, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__fetched = [];
  window.__alerts = 0;
  window.alert = function () { window.__alerts++; };
  window.fetch = function (u) {
    window.__fetched.push(String(u));
    if (String(u).indexOf('/api/config') !== -1) return Promise.resolve({ json: function () { return Promise.resolve({ recurly_public_key: 'pk-test' }); } });
    return Promise.reject(new Error('no network in this test'));
  };
  window.Element.prototype.scrollIntoView = function () {};
  window.recurly = {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; },
    Risk: function () { return {}; }
  };
  const deferred = [];
  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue;
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
      if (options.clientId && /wallet-paypal\.js$/.test(s.src)) {
        const patched = code.replace(/(PAYPAL_CLIENT_ID\s*=\s*)''/, "$1'" + options.clientId + "'");
        if (patched === code) throw new Error("wallet-paypal.js has no `PAYPAL_CLIENT_ID = ''` to substitute");
        code = patched;
      }
    } else {
      code = s.code;
    }
    if (s.defer) { deferred.push(code); continue; }
    window.eval(code);
  }
  for (const code of deferred) window.eval(code);
  window.__events = [];
  if (window.LeskoAnalytics) {
    const realTrack = window.LeskoAnalytics.track;
    window.LeskoAnalytics.track = function (name, params) { window.__events.push({ name, params }); if (realTrack) return realTrack.apply(this, arguments); };
  }
  if (options.paypalOn && window.LeskoWallets) window.LeskoWallets.WALLETS.paypal = true;
  if (options.emailValue !== undefined) window.document.getElementById('email').value = options.emailValue;
  lastNavigatedTo = null;
  return window;
}

// Input: nothing. Output: a promise resolved after queued microtasks (the /api/config fetch).
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// Input: a loaded window. Output: the PayPal SDK <script> tags the page added (zero or more).
function sdkTags(w) {
  return Array.from(w.document.querySelectorAll('script')).filter(function (s) { return /paypal\.com\/sdk\/js/.test(s.src); });
}

// Input: a loaded window and a capture object. Output: the capture, filled in as the stub SDK is
// used. Installs a stub `paypal` global, then fires the SDK tag's onload as a finished download
// would. capture.options = what Buttons() got; capture.created = every subscription.create()
// argument; capture.rejected = how often actions.reject() ran; capture.target = what render() got.
async function loadSdk(w, capture) {
  capture.created = [];
  capture.rejected = 0;
  capture.actions = {
    subscription: { create: function (o) { capture.created.push(o); return Promise.resolve('I-STUB'); } },
    reject: function () { capture.rejected++; return Promise.resolve('rejected'); }
  };
  w.paypal = {
    Buttons: function (opts) {
      capture.options = opts;
      capture.buttonsCalls = (capture.buttonsCalls || 0) + 1;
      return { render: function (target) { capture.target = target; return Promise.resolve(); } };
    }
  };
  const tag = sdkTags(w)[0];
  if (tag && tag.onload) tag.onload.call(tag);
  await flushMicrotasks();
  return capture;
}

const ON = { paypalOn: true, clientId: TEST_CLIENT_ID };

// ── as shipped: the client id is empty and the switch is off ───────────────────────────────────
(function () {
  const src = fs.readFileSync(path.join(dir, 'assets/wallet-paypal.js'), 'utf8');
  check('the file ships with PAYPAL_CLIENT_ID = \'\' (P3)', /PAYPAL_CLIENT_ID\s*=\s*''/.test(src));
  const common = fs.readFileSync(path.join(dir, 'assets/wallet-common.js'), 'utf8');
  check('the paypal switch ships false (C1)', /paypal:\s*false/.test(common));
  const code = src.replace(/\/\/.*$/gm, ''); // comments may mention alert; code may not call it
  check('the file never calls alert() (P7)', !/\balert\s*\(/.test(code));
})();

// ── P1: switch off -> no SDK tag, #wallets empty ───────────────────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', { paypalOn: false, clientId: TEST_CLIENT_ID });
  await flushMicrotasks();
  check('switch off: no PayPal SDK tag is added (P1)', sdkTags(w).length === 0, sdkTags(w).length);
  check('switch off: #wallets stays empty (P1)', w.document.getElementById('wallets').children.length === 0);
})();

// ── P3: switch on but client id empty (as shipped) -> nothing ──────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', { paypalOn: true });
  await flushMicrotasks();
  check('empty client id: no PayPal SDK tag is added (P3)', sdkTags(w).length === 0, sdkTags(w).length);
  check('empty client id: #wallets stays empty (P3)', w.document.getElementById('wallets').children.length === 0);
})();

// ── P1: switch on, no #wallets row -> nothing, no throw ────────────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({
    rewriteHtml: function (html) { return html.replace(/<div class="wallets" id="wallets"><\/div>/, ''); }
  }, ON));
  await flushMicrotasks();
  check('no #wallets row: no PayPal SDK tag is added (P1)', sdkTags(w).length === 0, sdkTags(w).length);
})();

// ── P2: half-year has no PayPal plan -> no SDK tag, no button ──────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=half-year', ON);
  await flushMicrotasks();
  check('half-year: no PayPal SDK tag is added (P2)', sdkTags(w).length === 0, sdkTags(w).length);
  check('half-year: #wallets stays empty (P2)', w.document.getElementById('wallets').children.length === 0);
})();

// ── P3: the SDK URL ────────────────────────────────────────────────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', ON);
  await flushMicrotasks();
  const tags = sdkTags(w);
  check('switch on + client id: exactly one PayPal SDK tag (P3)', tags.length === 1, tags.length);
  const u = tags[0] ? new URL(tags[0].src) : null;
  check('SDK comes from https://www.paypal.com/sdk/js (P3)', !!u && u.origin + u.pathname === 'https://www.paypal.com/sdk/js', u && u.href);
  const q = u ? u.searchParams : new URLSearchParams();
  check('SDK query carries our client id (P3)', q.get('client-id') === TEST_CLIENT_ID, q.get('client-id'));
  check('SDK query: vault=true, intent=subscription, currency=USD, components=buttons (P3)',
    q.get('vault') === 'true' && q.get('intent') === 'subscription' && q.get('currency') === 'USD' && q.get('components') === 'buttons', u && u.search);
  check('SDK query: card funding disabled (P8)', q.get('disable-funding') === 'card', q.get('disable-funding'));
  check('the old checkout.js is not used (P3)', !/paypalobjects\.com/.test(tags[0] ? tags[0].src : ''), tags[0] && tags[0].src);
})();

// ── P2 + P4: the exact plan id per ?plan=, and create() gets that and nothing else ─────────────
for (const [plan, planId] of [['monthly', MONTHLY_PLAN], ['yearly', YEARLY_PLAN]]) {
  await (async function () {
    const w = loadCheckout('https://leskobusiness.com/checkout?plan=' + plan, Object.assign({ emailValue: 'a@b.co' }, ON));
    await flushMicrotasks();
    const cap = await loadSdk(w, {});
    check(plan + ': Buttons() is created exactly once (P3)', cap.buttonsCalls === 1, cap.buttonsCalls);
    check(plan + ': the button renders into #wallets (P3)', cap.target === w.document.getElementById('wallets') || cap.target === '#wallets', String(cap.target));
    const id = await cap.options.createSubscription({}, cap.actions);
    check(plan + ': create() is called once with exactly { plan_id: ' + planId + ' } (P2, P4)',
      cap.created.length === 1 && JSON.stringify(cap.created[0]) === JSON.stringify({ plan_id: planId }), cap.created);
    check(plan + ': createSubscription returns what create() returned (P4)', id === 'I-STUB', id);
    check(plan + ': no request ever goes to /api/subscribe (P5)', w.__fetched.every(function (u) { return u.indexOf('/api/subscribe') === -1; }), w.__fetched);
  })();
}

// ── P5 + K7: approval -> GA4 event, then the /welcome URL with the subscription id kept ────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: '  Buyer@Example.COM ' }, ON));
  await flushMicrotasks();
  const cap = await loadSdk(w, {});
  await cap.options.onApprove({ subscriptionID: 'I-REAL123' }, cap.actions);
  check('approval goes to /welcome with the normalised email and the plan (P5, K7)',
    lastNavigatedTo === 'https://leskobusiness.com/welcome?email=buyer%40example.com&plan=monthly', lastNavigatedTo);
  const saved = JSON.parse(w.localStorage.getItem(Object.keys(w.localStorage).find(function (k) { return /lesko|checkout/i.test(k); })) || '{}');
  check('approval saves the email and plan in localStorage (K7)', saved.email === 'buyer@example.com' && saved.plan === 'monthly', saved);
  const ev = w.__events.filter(function (e) { return e.name === 'add_payment_info'; });
  check('approval sends one add_payment_info with payment_type PayPal (P5)',
    ev.length === 1 && ev[0].params.payment_type === 'PayPal' && ev[0].params.currency === 'USD', ev);
  check('no request goes to /api/subscribe on approval (P5)', w.__fetched.every(function (u) { return u.indexOf('/api/subscribe') === -1; }), w.__fetched);
})();

// ── P6: no typed email -> nothing is created and a named error shows ───────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: '' }, ON));
  await flushMicrotasks();
  const cap = await loadSdk(w, {});
  const payMsg = w.document.getElementById('payMsg');
  let threw = false;
  const hasOnClick = typeof cap.options.onClick === 'function';
  if (hasOnClick) await cap.options.onClick({}, cap.actions);
  try { await cap.options.createSubscription({}, cap.actions); } catch (e) { threw = true; }
  check('no email: no PayPal subscription is created (P6)', cap.created.length === 0, cap.created);
  check('no email: the error box asks for the email (P6)', /email/i.test(payMsg.textContent) && payMsg.classList.contains('show'), payMsg.textContent);
  // Each belt is pinned on its own (overseer review, 2026-10-17): with a single `or` check, deleting
  // onClick stayed green because createSubscription's throw satisfied it — and then the buyer gets
  // PayPal's window first and the error behind it.
  check('no email: onClick exists (P6)', hasOnClick);
  check('no email: onClick refuses the click through actions.reject(), so PayPal\'s window never opens (P6)', cap.rejected > 0, cap.rejected);
  check('no email: createSubscription throws on its own (P6)', threw);
})();

// ── P7: failures go to #payMsg, a cancel shows nothing, alert() is never called ────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: 'a@b.co' }, ON));
  await flushMicrotasks();
  const cap = await loadSdk(w, {});
  const payMsg = w.document.getElementById('payMsg');
  cap.options.onCancel({});
  check('a cancel shows nothing (P7)', !payMsg.classList.contains('show') && payMsg.textContent.trim() === '', payMsg.textContent);
  cap.options.onError(new Error('boom'));
  check('onError shows a PayPal message in #payMsg and keeps the card usable (P7)', payMsg.classList.contains('show') && /PayPal/.test(payMsg.textContent), payMsg.textContent);
  payMsg.classList.remove('show'); payMsg.textContent = '';
  await cap.options.onApprove({}, cap.actions);
  check('an approval without a subscription id says we could not confirm, and does not navigate (P7)',
    /could not confirm your PayPal payment/.test(payMsg.textContent) && /contact support/.test(payMsg.textContent) && lastNavigatedTo === null, { text: payMsg.textContent, nav: lastNavigatedTo });
  check('window.alert was never called (P7)', w.__alerts === 0, w.__alerts);
})();

process.exit(failCount > 0 ? 1 : 0);
