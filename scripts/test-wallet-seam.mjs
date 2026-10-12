#!/usr/bin/env node
// Proves K1-K6 under "LeskoCheckout — the seam checkout.html publishes" in
// docs/specs/modules/wallets.md, without a real browser. Input: a directory holding
// checkout.html (either this repo, or a scratch copy of some other commit made with
// `git archive`). Output: one PASS/FAIL line per check below, and a process exit code (0 only if
// every check passed). Exists so the change from "window.LeskoCheckout is undefined" (red, on
// origin/main) to "the six functions exist and behave as specced" (green, on this branch) is
// provable from a fresh shell, not just asserted in prose.
//
// Mirrors scripts/test-checkout-address.mjs's own jsdom harness (re-implemented here rather than
// imported, so this file stays runnable against a standalone scratch copy of the repo that may
// not carry that other script at all).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// jsdom deliberately does not implement a real `location.href = '...'` navigation to a different
// page — it logs "Not implemented: navigation to another Document" and leaves location.href
// unchanged, so there is no public API to read what a page tried to navigate to. This patches
// jsdom's own internal navigate() (the one thing every location.href/assign/replace setter calls)
// to record the attempted URL instead, so K3's "finish() sends the buyer to /welcome" can be
// proven the same way a browser's address bar would show it. Nothing about checkout.html itself
// is touched; this is test-only instrumentation of the test harness's own jsdom copy. The patch
// has to land before jsdom's own `Location` class is ever loaded — that class keeps its own
// reference to navigate(), taken once the first time it loads — so this requires jsdom through
// the same `require` used to reach into its internals, instead of the usual top-of-file `import`.
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
  console.error('usage: test-wallet-seam.mjs <dir>');
  process.exit(2);
}

let failCount = 0;
// Input: a human-readable label and whether the thing it describes held true. Output: none;
// prints PASS or FAIL and remembers failures so the script's own exit code can report them.
function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (extra !== undefined && !ok ? ' (got ' + JSON.stringify(extra) + ')' : ''));
  if (!ok) failCount++;
}

// Input: the raw text of one HTML page. Output: an array of { src, code } in document order — src
// set for an external <script src="...">, code set (and src null) for an inline <script>...</script>
// — plus that same HTML with every <script>...</script> removed. Why: JSDOM does not fetch local
// files for a script's src, and this test must not touch the real network either, so every
// script's actual code is read here and run by hand, in the order the page itself would run it.
// `defer` scripts are skipped entirely here (not just left unread) — this test's harness runs
// every non-deferred script by hand, in order, before anything deferred would run in a real
// browser, which is exactly where K1-K5 live. The wallet files' own behaviour has its own test
// (test-wallet-common.js, test-wallet-paypal.sh); this one must not even require they exist yet.
function extractScripts(html) {
  const scripts = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : 'text/javascript';
    if (type !== 'text/javascript' && type !== 'application/javascript' && type !== 'module') {
      return whole;
    }
    if (/\bdefer\b/i.test(attrs)) return '';
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    scripts.push(srcMatch ? { src: srcMatch[1], code: null } : { src: null, code: body });
    return '';
  });
  return { scripts, stripped };
}

// Input: the URL (with its ?plan=) to load checkout.html at, and an options object: `rewriteHtml`
// (used once below, to prove K4's `null` on a page with no #wallets row), `recurlyStub` and
// `configResponse` (used for the K5 regression, so the card submit path has a window.recurly and
// an answered /api/config to reach recurly.token() through). Output: the JSDOM `window` after
// every local <script> on checkout.html ran, in order, exactly as authored — the wallet files
// themselves are deferred and declared external (https://.../wallet-*.js is not local), so
// loadCheckout alone proves only the inline script's own seam; nothing here depends on
// wallet-common.js or wallet-paypal.js existing yet.
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
  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue; // external CDN/deferred wallet scripts — not needed here
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
    } else {
      code = s.code;
    }
    window.eval(code);
  }
  return window;
}

// Input: nothing. Output: a promise that resolves once every microtask queued so far — including
// ones queued by callbacks those microtasks themselves queue — has run. setupCard() reaches
// recurly.configure() only after fetch('/api/config') resolves, several microtask hops away.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// ── K1: plan() and total() for all three plans, and a fallback for junk ?plan= ──
[
  ['monthly', 29.95],
  ['half-year', 89.95],
  ['yearly', 149.95]
].forEach(function ([planKey, price]) {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=' + planKey);
  check('window.LeskoCheckout exists for ?plan=' + planKey, !!w.LeskoCheckout);
  if (w.LeskoCheckout) {
    check('LeskoCheckout.plan() === ' + JSON.stringify(planKey), w.LeskoCheckout.plan() === planKey, w.LeskoCheckout.plan());
    check('LeskoCheckout.total() === ' + price, w.LeskoCheckout.total() === price, w.LeskoCheckout.total());
  }
});
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=not-a-real-plan');
  check('a junk ?plan= falls back to monthly, the same the card path uses', w.LeskoCheckout.plan() === 'monthly', w.LeskoCheckout.plan());
  check('a junk ?plan= still gives a numeric total()', w.LeskoCheckout.total() === 29.95, w.LeskoCheckout.total());
})();

// ── K2: showError(message) fills #payMsg and scrolls to it ──────────────────────
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly');
  const payMsg = w.document.getElementById('payMsg');
  w.LeskoCheckout.showError('We did not get an email address back from PayPal. Please pay by card instead.');
  check('showError(message) fills #payMsg', payMsg.textContent.includes('PayPal'));
  check('showError(message) shows the box', payMsg.classList.contains('show'));
  check('showError(message) with no second argument still scrolls (to #payMsg itself)', w.__scrollTargets.indexOf(payMsg) !== -1);
})();

// ── K3: finish(result, tokenId, buyerEmail) saves to localStorage and goes to /welcome ──────────
(function () {
  // The card path: no buyerEmail argument, so finish() reads the page's own #email field — the
  // same convention the card submit handler already relies on.
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=yearly');
  w.document.getElementById('email').value = 'a@b.co';
  lastNavigatedTo = null;
  w.LeskoCheckout.finish({ ok: true }, 'tok-1');
  check('finish({ok:true},"tok-1") with the card email box filled sets location.href to /welcome with that email and plan',
    lastNavigatedTo === 'https://leskobusiness.com/welcome?email=a%40b.co&plan=yearly', lastNavigatedTo);
})();
(function () {
  // The email finish() stores comes from the page's own #email field (the card path's own
  // convention — a wallet purchase never typed one there), so this checks the localStorage side
  // of K3 using that field, the same way the card submit handler already does.
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly');
  w.document.getElementById('email').value = 'buyer@example.com';
  w.LeskoCheckout.finish({ ok: true }, 'tok-1');
  let saved = null;
  try { saved = JSON.parse(w.localStorage.getItem('leskoCheckout')); } catch (e) {}
  check('finish({ok:true}) saves the email/plan to localStorage', !!saved && saved.email === 'buyer@example.com' && saved.plan === 'monthly', saved);
})();
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly');
  const payMsg = w.document.getElementById('payMsg');
  w.LeskoCheckout.finish({ message: 'Your card was declined.' }, 'tok-1');
  check('finish() with neither ok nor a 3DS token shows the message via showError', payMsg.textContent.includes('declined'));
})();

// ── K3b: a wallet buyer never types into #email, so finish() takes their address as a third ───
// ── argument instead, and uses it even though the DOM field is empty. ──────────────────────────
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=yearly');
  check('the card email box starts empty (this test proves K3b needs no DOM value at all)', w.document.getElementById('email').value === '');
  lastNavigatedTo = null;
  w.LeskoCheckout.finish({ ok: true }, 'tok-1', 'w@b.co');
  check('finish({ok:true},"tok-1","w@b.co") with the card email box empty puts w%40b.co in the /welcome URL (K3b)',
    lastNavigatedTo === 'https://leskobusiness.com/welcome?email=w%40b.co&plan=yearly', lastNavigatedTo);
  let saved = null;
  try { saved = JSON.parse(w.localStorage.getItem('leskoCheckout')); } catch (e) {}
  check('finish(...,"w@b.co") saves buyerEmail (not the empty DOM field) to localStorage too (K3b)',
    !!saved && saved.email === 'w@b.co', saved);
})();

// ── K3b amendment (2026-10-09): an upper-case, space-padded wallet email normalises the same way ──
// ── the card path's own subscribe() already normalises its #email field, so one buyer never gets ──
// ── two Recurly accounts over how a wallet happened to case their address. ─────────────────────
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=yearly');
  lastNavigatedTo = null;
  w.LeskoCheckout.finish({ ok: true }, 'tok-1', '  Buyer@Example.COM  ');
  check('a wallet email reaches the /welcome URL lower-cased and trimmed (K3b amendment)',
    lastNavigatedTo === 'https://leskobusiness.com/welcome?email=buyer%40example.com&plan=yearly', lastNavigatedTo);
  let saved = null;
  try { saved = JSON.parse(w.localStorage.getItem('leskoCheckout')); } catch (e) {}
  check('the same wallet email reaches localStorage lower-cased and trimmed too (K3b amendment)',
    !!saved && saved.email === 'buyer@example.com', saved);
})();

// ── K3a: the 3-D Secure retry re-submits the original tokenId it was given, never undefined ────
await (async function () {
  let capturedToken = 'not-called';
  const tdsHandlers = {};
  const recurlyStub = {
    Risk: function () {
      return { ThreeDSecure: function () { return { on: function (ev, cb) { tdsHandlers[ev] = cb; }, attach: function () {} }; } };
    }
  };
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', { recurlyStub: recurlyStub });
  w.fetch = function (u, opts) {
    if (String(u).indexOf('/api/subscribe') !== -1) {
      capturedToken = JSON.parse(opts.body).token;
      return Promise.resolve({ json: function () { return Promise.resolve({ ok: true }); } });
    }
    return Promise.reject(new Error('unexpected fetch ' + u));
  };
  w.LeskoCheckout.finish({ three_d_secure_action_token_id: '3ds-action' }, 'tok-original', 'w@b.co');
  tdsHandlers.token({ id: 'bank-result-tok' });
  await flushMicrotasks();
  check('the 3-D Secure retry re-submits with the tokenId finish() was given, not undefined (K3a)',
    capturedToken === 'tok-original', capturedToken);
})();

// ── K4: walletsRow() returns #wallets, or null when the markup is missing ──────
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly');
  const row = w.LeskoCheckout.walletsRow();
  check('walletsRow() returns the #wallets element', !!row && row.id === 'wallets');
})();
(function () {
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    rewriteHtml: function (html) { return html.replace(/<div class="wallets" id="wallets"><\/div>/, ''); }
  });
  check('a page with no #wallets row: walletsRow() returns null, not throw', w.LeskoCheckout.walletsRow() === null);
})();

// ── K5: publishing the seam changes no card behaviour — the card submit path ───
// ── still reaches Recurly for a token (same proof as test-checkout-address.mjs). ──
await (async function () {
  let tokenCalled = false;
  const recurlyStub = {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; },
    token: function () { tokenCalled = true; },
    Risk: function () { return {}; }
  };
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: recurlyStub,
    configResponse: { recurly_public_key: 'pk-test' }
  });
  await flushMicrotasks();
  // The default country (US) requires state and postal_code too (checkout.html's own
  // updateAddressRequirements(), run once on load) — every field collect() can block on needs a
  // value here, or the submit handler never reaches recurly.token() at all.
  ['first_name', 'last_name', 'email', 'address1', 'city', 'state', 'postal_code'].forEach(function (id) {
    w.document.getElementById(id).value = 'x';
  });
  w.document.getElementById('email').value = 'a@b.co';
  w.document.getElementById('payForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('the card submit path still reaches recurly.token() after the seam is published', tokenCalled === true);
})();

// ── K6: onReady(callback) runs callback once recurly.configure() has succeeded — never before, ──
// ── and immediately if called after it already has. ────────────────────────────────────────────
await (async function () {
  let fired = false;
  const recurlyStub = {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; }
  };
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: recurlyStub,
    configResponse: { recurly_public_key: 'pk-test' }
  });
  w.LeskoCheckout.onReady(function () { fired = true; });
  check('onReady has not fired synchronously, before the async /api/config answer drives configure()', fired === false);
  await flushMicrotasks();
  check('onReady fires once recurly.configure() succeeds, having been called before it did (K6)', fired === true);
})();
await (async function () {
  let fired = false;
  const recurlyStub = {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; }
  };
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly', {
    recurlyStub: recurlyStub,
    configResponse: { recurly_public_key: 'pk-test' }
  });
  await flushMicrotasks();
  w.LeskoCheckout.onReady(function () { fired = true; });
  check('onReady fires immediately when called after recurly.configure() already succeeded (K6)', fired === true);
})();
await (async function () {
  let fired = false;
  const w = loadCheckout('https://leskobusiness.com/checkout?plan=monthly');
  // No recurlyStub and no configResponse: window.recurly stays unset and fetch('/api/config')
  // rejects, so setupCard() returns before ever calling recurly.configure() — onReady must never
  // fire on a page where Recurly never configures at all.
  w.LeskoCheckout.onReady(function () { fired = true; });
  await flushMicrotasks();
  check('onReady never fires when recurly.configure() never runs (K6)', fired === false);
})();

process.exit(failCount > 0 ? 1 : 0);
