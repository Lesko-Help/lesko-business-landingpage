#!/usr/bin/env node
// Proves P1-P9, C7 and K7 under "init() — assets/wallet-paypal.js" in docs/specs/modules/wallets.md
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

const MONTHLY_PLAN = 'P-7R176589BE0160805NLJVCFI';
const HALF_YEAR_PLAN = 'P-2GV64945HR320740CNLIP2HY';
const YEARLY_PLAN = 'P-8M862053KT491162FNLJVCFI';
const TEST_CLIENT_ID = 'test-client-id';

let failCount = 0;
let checkCount = 0;
// How many checks run BEFORE the final "ran to the end" guard below (its own arguments are
// evaluated before check() increments the counter, so it counts everything but itself). It is
// asserted at the bottom, because a suite can otherwise "pass" by stopping early: when
// wallet-paypal.js's give-up timeout was deleted in a red-proof (2026-10-23), the one promise this
// file awaited never settled, node found an empty event loop, exited 0 — and every remaining check
// simply never ran, which read as green. Raise this number with the same commit that adds checks.
const EXPECTED_CHECKS = 66;
// Input: a human-readable label and whether the thing it describes held true. Output: none;
// prints PASS or FAIL and remembers failures so the exit code can report them.
function check(label, ok, extra) {
  checkCount++;
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (extra !== undefined && !ok ? ' (got ' + JSON.stringify(extra) + ')' : ''));
  if (!ok) failCount++;
}

// Input: the promise onApprove returned and a number of milliseconds. Output: a promise for
// 'ok' (it finished), 'rejected' (it blew up) or 'timeout' (it never settled) — never a throw.
// Why all three are named rather than awaited: `await`ing onApprove directly lets a hang end the
// suite silently and lets a rejection abort the block mid-way, and both read as green to anything
// that only greps for FAIL (found twice while red-proving this file, 2026-10-23). Its own timer
// also keeps node's event loop alive, which is what stops that silent exit.
function outcomeWithin(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).then(function () { return 'ok'; }, function () { return 'rejected'; }),
    new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, ms); })
  ]);
}

// Input: nothing. Output: wallet-paypal.js's own EMAIL_LOOKUP_MS, so the test waits as long as the
// file says and not a number typed twice.
function emailLookupMs() {
  const m = fs.readFileSync(path.join(dir, 'assets/wallet-paypal.js'), 'utf8').match(/EMAIL_LOOKUP_MS\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 4000;
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

// Input: the text of wallet-paypal.js. Output: the id between the quotes of PAYPAL_CLIENT_ID, or
// null when the line is missing. Why: the harness needs it to tell "already the id I wanted" from
// "nothing to patch".
function shippedClientId(code) {
  const m = code.match(/PAYPAL_CLIENT_ID\s*=\s*'([^']*)'/);
  return m ? m[1] : null;
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
      if (options.clientId !== undefined && /wallet-paypal\.js$/.test(s.src)) {
        // Swaps whatever id the file ships with for the test's own (`''` gives the empty-id case).
        const patched = code.replace(/(PAYPAL_CLIENT_ID\s*=\s*)'[^']*'/, "$1'" + options.clientId + "'");
        if (patched === code && options.clientId !== shippedClientId(code)) throw new Error("wallet-paypal.js has no `PAYPAL_CLIENT_ID = '...'` to substitute");
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
  if (options.paypalOn !== undefined && window.LeskoWallets) window.LeskoWallets.WALLETS.paypal = options.paypalOn; // the shipped switch is on, so P1 must force it off
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
// `subscriptionGet` (optional) becomes actions.subscription.get, the call wallet-paypal.js uses to
// ask PayPal which address it is billing. Left out, `get` is absent altogether — which is both the
// shape of an older PayPal SDK and the case every pre-existing check below relies on, since then the
// typed address is the only one available.
async function loadSdk(w, capture, subscriptionGet) {
  capture.created = [];
  capture.rejected = 0;
  capture.actions = {
    subscription: { create: function (o) { capture.created.push(o); return Promise.resolve('I-STUB'); } },
    reject: function () { capture.rejected++; return Promise.resolve('rejected'); }
  };
  if (subscriptionGet) capture.actions.subscription.get = subscriptionGet;
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
  check('the file ships a real PayPal client id: 80 URL-safe characters (P3)', /PAYPAL_CLIENT_ID\s*=\s*'[A-Za-z0-9_-]{80}'/.test(src));
  const common = fs.readFileSync(path.join(dir, 'assets/wallet-common.js'), 'utf8');
  check('the paypal switch ships true (C1)', /paypal:\s*true/.test(common));
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

// ── P3: switch on but client id empty -> nothing ──────────────────────────────────
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', { paypalOn: true, clientId: '' });
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

// ── P2: a plan with no PayPal entry -> no SDK tag, no button (the `!planId` guard) ─────────────
await (async function () {
  // checkout.html itself turns an unknown ?plan= into monthly, so make the page report a plan name
  // that PayPal's table has no entry for; that is the only way to reach the `!planId` guard.
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({
    rewriteHtml: function (html) { return html.replace("plan: function () { return plan; }", "plan: function () { return 'unlisted-plan'; }"); }
  }, ON));
  await flushMicrotasks();
  check('unknown plan: no PayPal SDK tag is added (P2)', sdkTags(w).length === 0, sdkTags(w).length);
  check('unknown plan: #wallets stays empty (P2)', w.document.getElementById('wallets').children.length === 0);
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
for (const [plan, planId] of [['monthly', MONTHLY_PLAN], ['half-year', HALF_YEAR_PLAN], ['yearly', YEARLY_PLAN]]) {
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

// ── P6: an empty email box never blocks the click (changed 2026-10-23) ─────────────────────────
// Until this change an empty box rejected the click and showed a red line. It refused two clicks in
// five on the live page and protected nothing: lesko-provisioning grants access to the address on
// PayPal's webhook, never to the one typed here. These checks pin the refusal gone, so it cannot
// come back by accident.
await (async function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: '' }, ON));
  await flushMicrotasks();
  const cap = await loadSdk(w, {});
  const payMsg = w.document.getElementById('payMsg');
  await cap.options.onClick({}, cap.actions);
  check('no email: the click is NOT rejected, so PayPal\'s window opens (P6)', cap.rejected === 0, cap.rejected);
  check('no email: nothing is shown in the error box (P6)', payMsg.textContent.trim() === '' && !payMsg.classList.contains('show'), payMsg.textContent);
  let threw = false;
  try { await cap.options.createSubscription({}, cap.actions); } catch (e) { threw = true; }
  check('no email: createSubscription does not throw (P6)', !threw);
  check('no email: the subscription IS created on the right plan (P6)',
    cap.created.length === 1 && cap.created[0].plan_id === MONTHLY_PLAN, cap.created);
})();

// ── P6 + K7: which address reaches /welcome, in priority order ─────────────────────────────────
// PayPal's own address wins, because that is the one provisioning grants access to. Each case drives
// a real onApprove and reads the URL the page navigated to.
await (async function () {
  // Input: the typed value and a stub for actions.subscription.get. Output: the email in the
  // /welcome URL after an approval, or null when the page never navigated.
  const approvedWith = async function (typed, subscriptionGet) {
    const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: typed }, ON));
    await flushMicrotasks();
    const cap = await loadSdk(w, {}, subscriptionGet);
    await cap.options.onApprove({ subscriptionID: 'I-REAL123' }, cap.actions);
    await flushMicrotasks();
    return { nav: lastNavigatedTo, payMsg: w.document.getElementById('payMsg').textContent };
  };
  const paypalSays = function (address) {
    return function () { return Promise.resolve({ subscriber: { email_address: address } }); };
  };

  let r = await approvedWith('typed@example.com', paypalSays('Payer@PayPal.COM'));
  check('PayPal\'s address beats the typed one, normalised (P6)',
    r.nav === 'https://leskobusiness.com/welcome?email=payer%40paypal.com&plan=monthly', r.nav);

  r = await approvedWith('', paypalSays('payer@paypal.com'));
  check('nothing typed: PayPal\'s address is used (P6)',
    r.nav === 'https://leskobusiness.com/welcome?email=payer%40paypal.com&plan=monthly', r.nav);

  r = await approvedWith('typed@example.com', paypalSays(''));
  check('PayPal gives no address: the typed one is used (P6)',
    r.nav === 'https://leskobusiness.com/welcome?email=typed%40example.com&plan=monthly', r.nav);

  r = await approvedWith('', undefined);
  check('neither address: the order still completes, /welcome gets an empty email (P6, P7)',
    r.nav === 'https://leskobusiness.com/welcome?email=&plan=monthly', r.nav);
})();

// ── P7: asking PayPal for the address may never lose a paid order ──────────────────────────────
// The money is gone by the time paypalEmail() runs, so every way that call can fail has to end in a
// completed order. A hanging call is the dangerous one: without the timeout the buyer waits forever
// on a page that has already been charged.
await (async function () {
  const approve = async function (subscriptionGet) {
    const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: 'typed@example.com' }, ON));
    await flushMicrotasks();
    const cap = await loadSdk(w, {}, subscriptionGet);
    const done = cap.options.onApprove({ subscriptionID: 'I-REAL123' }, cap.actions);
    return { w, done };
  };

  const WELCOME = 'https://leskobusiness.com/welcome?email=typed%40example.com&plan=monthly';
  // Input: a label and a stub for actions.subscription.get. Output: none; checks that the order
  // completed — onApprove settled without rejecting AND the buyer reached /welcome with the typed
  // address, since PayPal gave none. Every failure mode of that call has to land here.
  const completes = async function (label, subscriptionGet) {
    const r = await approve(subscriptionGet);
    const outcome = await outcomeWithin(r.done, emailLookupMs() + 4000);
    await flushMicrotasks();
    check(label, outcome === 'ok' && lastNavigatedTo === WELCOME, { outcome, nav: lastNavigatedTo });
  };

  await completes('a rejected subscription.get() still completes the order (P7)',
    function () { return Promise.reject(new Error('paypal said no')); });
  await completes('a throwing subscription.get() still completes the order (P7)',
    function () { throw new Error('threw outright'); });
  await completes('a subscription with no subscriber still completes the order (P7)',
    function () { return Promise.resolve({ subscriber: null }); });

  // The hang: get() never settles, so only wallet-paypal.js's own give-up timeout can finish the
  // order. Checked through the same helper, so "never settled" fails loudly instead of ending the
  // suite.
  const r = await approve(function () { return new Promise(function () {}); });
  const hungNav = lastNavigatedTo;
  const hangOutcome = await outcomeWithin(r.done, emailLookupMs() + 4000);
  await flushMicrotasks();
  check('a subscription.get() that never answers is given up on, and the order completes (P7)',
    hangOutcome === 'ok' && lastNavigatedTo === WELCOME, { outcome: hangOutcome, nav: lastNavigatedTo });
  check('that hang really was still pending before the timeout fired (the check above is not vacuous)',
    hungNav === null, hungNav);

  // A finish() that throws is the one failure the buyer must be told about.
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: 'typed@example.com' }, ON));
  await flushMicrotasks();
  const cap = await loadSdk(w, {});
  w.LeskoCheckout.finish = function () { throw new Error('finish broke'); };
  await cap.options.onApprove({ subscriptionID: 'I-REAL123' }, cap.actions);
  await flushMicrotasks();
  check('a throwing finish() tells the buyer to contact support (P7)',
    /could not confirm your PayPal payment/.test(w.document.getElementById('payMsg').textContent), w.document.getElementById('payMsg').textContent);
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

// ── P9: the funnel events — click, refused click, cancel, error (shared shape, spec C7) ────────
await (async function () {
  const names = ['wallet_click', 'wallet_click_refused', 'wallet_cancel', 'wallet_error'];
  // Input: a window and an event name. Output: the params of every such event sent so far.
  const sent = function (w, name) { return w.__events.filter(function (e) { return e.name === name; }).map(function (e) { return e.params; }); };
  // Input: params. Output: whether they carry the shared shape for this plan (monthly, $29.95).
  const shapeOk = function (p) {
    return !!p && p.currency === 'USD' && p.value === 29.95 && p.payment_type === 'PayPal' &&
      Array.isArray(p.items) && p.items.length === 1 && p.items[0].item_id === 'monthly' && p.items[0].price === 29.95 && p.items[0].quantity === 1;
  };

  // A click with an email typed: one wallet_click, no refusal, PayPal's window is allowed to open.
  let w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: 'a@b.co' }, ON));
  await flushMicrotasks();
  let cap = await loadSdk(w, {});
  await cap.options.onClick({}, cap.actions);
  check('click with an email: one wallet_click in the shared shape (P9, C7)', sent(w, 'wallet_click').length === 1 && shapeOk(sent(w, 'wallet_click')[0]), sent(w, 'wallet_click'));
  check('click with an email: no wallet_click_refused and no reject (P9)', sent(w, 'wallet_click_refused').length === 0 && cap.rejected === 0, sent(w, 'wallet_click_refused'));

  // A click with no email: still exactly one wallet_click, and no refusal of any kind, because the
  // refusal is gone (P6, changed 2026-10-23).
  w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: '' }, ON));
  await flushMicrotasks();
  cap = await loadSdk(w, {});
  await cap.options.onClick({}, cap.actions);
  check('click without an email: wallet_click is still sent, so it is the whole denominator (P9)', sent(w, 'wallet_click').length === 1 && shapeOk(sent(w, 'wallet_click')[0]), sent(w, 'wallet_click'));
  check('click without an email: no wallet_click_refused is sent any more (P9, C7)', sent(w, 'wallet_click_refused').length === 0, sent(w, 'wallet_click_refused'));
  check('click without an email: the click is not rejected (P6)', cap.rejected === 0, cap.rejected);

  // Cancel and error.
  w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: 'a@b.co' }, ON));
  await flushMicrotasks();
  cap = await loadSdk(w, {});
  cap.options.onCancel({});
  check('cancel: one wallet_cancel in the shared shape (P9, C7)', sent(w, 'wallet_cancel').length === 1 && shapeOk(sent(w, 'wallet_cancel')[0]), sent(w, 'wallet_cancel'));
  check('cancel: still nothing shown to the buyer (P7)', w.document.getElementById('payMsg').textContent.trim() === '' && !w.document.getElementById('payMsg').classList.contains('show'));
  cap.options.onError(new Error('secret card detail 4111'));
  const errs = sent(w, 'wallet_error');
  check('error: one wallet_error in the shared shape (P9, C7)', errs.length === 1 && shapeOk(errs[0]), errs);
  check('error: the error text is not sent to Google (P9)', JSON.stringify(errs).indexOf('4111') === -1 && JSON.stringify(errs).indexOf('secret') === -1, errs);

  // Approval keeps exactly one add_payment_info and none of the funnel events.
  await cap.options.onApprove({ subscriptionID: 'I-1' }, cap.actions);
  check('approval still sends exactly one add_payment_info, unchanged shape (P5)',
    w.__events.filter(function (e) { return e.name === 'add_payment_info'; }).length === 1 && shapeOk(sent(w, 'add_payment_info')[0]), sent(w, 'add_payment_info'));

  // Analytics must never break the button: a track() that throws leaves click, cancel and error working.
  w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', Object.assign({ emailValue: '' }, ON));
  await flushMicrotasks();
  cap = await loadSdk(w, {});
  w.LeskoAnalytics.track = function () { throw new Error('analytics down'); };
  let survived = true;
  try { await cap.options.onClick({}, cap.actions); cap.options.onCancel({}); cap.options.onError(new Error('x')); } catch (e) { survived = false; }
  check('a throwing track() never breaks click, cancel or error (P9)', survived && cap.rejected === 0, cap.rejected);
  // Reads the SOURCE, not this file's own list: every event name wallet-paypal.js hands to
  // trackWalletEvent must be one of the C7 names, so a fifth event added later cannot slip in
  // unnamed. Since 2026-10-23 PayPal sends three of the four: it has no refusal left to report, and
  // `wallet_click_refused` stays a C7 name for Apple Pay and Google Pay, which still refuse on an
  // empty email in wallet-common.js (C3).
  const paypalSends = ['wallet_click', 'wallet_cancel', 'wallet_error'];
  const source = fs.readFileSync(path.join(dir, 'assets/wallet-paypal.js'), 'utf8').replace(/\/\/.*$/gm, '');
  const used = Array.from(source.matchAll(/trackWalletEvent\(\s*'([^']*)'/g)).map(function (m) { return m[1]; });
  check('the source sends only C7 event names, and exactly the three PayPal still has (C7)',
    used.length > 0 && used.every(function (n) { return names.includes(n); }) && paypalSends.every(function (n) { return used.includes(n); }), used);
  check('the source no longer sends wallet_click_refused (P6, changed 2026-10-23)', !used.includes('wallet_click_refused'), used);
})();

// The last check, and the one that makes every other check trustworthy: the suite reached its own
// end. Without it, a promise that never settles lets node exit 0 partway through and the missing
// checks look like checks that passed.
check('the suite ran to the end: ' + EXPECTED_CHECKS + ' checks (raise EXPECTED_CHECKS when adding one)',
  checkCount === EXPECTED_CHECKS, checkCount);

process.exit(failCount > 0 ? 1 : 0);
