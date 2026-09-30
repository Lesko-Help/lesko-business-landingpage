#!/usr/bin/env node
// Proves the GA4 wiring on index.html, checkout.html and welcome.html without a real browser.
// Input: a directory holding those three files and assets/analytics.js (either this repo, or a
// scratch copy of some other commit made with `git archive`). Output: one PASS/FAIL line per check
// below, and a process exit code (0 only if every check passed). Exists so the change from "no
// analytics.js, checkout.html and welcome.html send nothing" (red, on origin/main) to "all three
// pages fire the right events, and none of them do with the id left empty" (green, on this branch)
// is provable from a fresh shell, not just asserted in prose.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: test-ga4-events.mjs <dir>');
  process.exit(2);
}

let failCount = 0;
// Input: a human-readable label and whether the thing it describes held true. Output: none; prints
// PASS or FAIL and remembers failures so the script's own exit code can report them.
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failCount++;
}

// Input: the raw text of one HTML page. Output: an array of { src, code } in document order — src
// set for an external <script src="...">, code set (and src null) for an inline <script>...</script>
// — plus that same HTML with every <script>...</script> removed. Why: JSDOM does not fetch local
// files for a script's src, and this test must not touch the real network either, so every script's
// actual code is read here and run by hand, in the order the page itself would run it.
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

// Input: a page's file name, the URL it should believe it was loaded at, an id to substitute into
// assets/site-events.js's own empty default (or null to leave it shipped-empty), and whether to
// simulate site-events.js failing to load (an ad blocker or a network error: the browser just never
// runs that file, nothing throws). Output: the JSDOM `window` after every remaining script on that
// page ran, in order, exactly as authored, plus window.__scriptErrors (any error thrown by a script
// block, kept instead of raised — a real browser stops only the block that threw, not the whole
// page, and this test needs to check what happened to the *other* blocks on that page). Why: every
// check below needs a page's own click/submit handlers to have actually run, the same way a
// visitor's browser would run them, but offline and without installing anything into the repo itself.
function loadPage(file, url, forcedId, blockAnalytics) {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const { scripts, stripped } = extractScripts(html);
  const dom = new JSDOM(stripped, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__scriptErrors = [];
  window.fetch = function () { return Promise.reject(new Error('no network in this test')); };
  // jsdom has no IntersectionObserver; index.html uses one for an unrelated scroll effect that
  // this test does not check, so a harmless stub lets that code run without touching analytics.
  window.IntersectionObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  // Same for matchMedia, used by unrelated reduced-motion/video code this test does not check.
  window.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
  // jsdom has no layout, so scrollIntoView (used by checkout.html's error banner) is a no-op here.
  window.Element.prototype.scrollIntoView = function () {};
  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue; // external CDN scripts (Recurly, GA itself) — not local, not needed
      if (blockAnalytics && isSharedAnalyticsSrc(s.src)) continue; // blocked: this <script> tag never runs at all
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
      if (forcedId && isSharedAnalyticsSrc(s.src)) {
        const before = code;
        code = code.replace("GA4_MEASUREMENT_ID = ''", "GA4_MEASUREMENT_ID = '" + forcedId + "'");
        if (code === before) throw new Error('could not patch GA4_MEASUREMENT_ID in ' + s.src);
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
  return window;
}

// Input: a jsdom window. Output: every gtag() call queued in its dataLayer, as [command, name, params].
function events(window) {
  return (window.dataLayer || []).map(function (a) { return Array.prototype.slice.call(a); });
}

// Input: a window's queued events and a GA4 event name. Output: the params object of the first
// matching 'event' call, or undefined.
function findEvent(window, name) {
  const hit = events(window).find(function (e) { return e[0] === 'event' && e[1] === name; });
  return hit ? hit[2] : undefined;
}

const FORCED_ID = 'G-TEST';

// Input: a script's src attribute. Output: whether it is the one shared GA4 file, under either its
// current name (site-events.js) or its old one (analytics.js) — so this same harness can also be
// pointed at a scratch copy of an older commit and still recognise which file to patch or block.
function isSharedAnalyticsSrc(src) {
  return src === '/assets/site-events.js' || src === '/assets/analytics.js';
}

// ── index.html ──────────────────────────────────────────────────────────────
(function () {
  const w = loadPage('index.html', 'https://leskobusiness.com/', FORCED_ID);
  const link = w.document.querySelector('a[href^="/checkout?plan="]');
  check('index.html has a /checkout?plan= link to click', !!link);
  if (link) link.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  const joinLink = w.document.querySelector('a[href="#pricing"]');
  if (joinLink) joinLink.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

  const form = [...w.document.querySelectorAll('form')].find(function (f) {
    return (f.getAttribute('action') || '').indexOf('app.kit.com/forms/') !== -1;
  });
  check('index.html has the newsletter form', !!form);
  if (form) form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const bc = findEvent(w, 'begin_checkout');
  check('index.html: begin_checkout fires on the checkout link click', !!bc);
  check('index.html: begin_checkout carries currency USD and a plan value', !!bc && bc.currency === 'USD' && typeof bc.value === 'number');
  check('index.html: join_button_click fires on #pricing', !!findEvent(w, 'join_button_click'));
  check('index.html: generate_lead fires on the newsletter submit', !!findEvent(w, 'generate_lead'));
})();

// ── checkout.html ───────────────────────────────────────────────────────────
(function () {
  const w = loadPage('checkout.html', 'https://leskobusiness.com/checkout?plan=yearly', FORCED_ID);
  const configCalls = events(w).filter(function (e) { return e[0] === 'config'; });
  const lastConfig = configCalls[configCalls.length - 1];
  check('checkout.html: config call carries the plan', !!lastConfig && lastConfig[2] && lastConfig[2].plan === 'yearly');

  ['first_name', 'last_name', 'address1', 'city', 'state', 'postal_code'].forEach(function (id) {
    w.document.getElementById(id).value = 'x';
  });
  w.document.getElementById('email').value = 'buyer@example.com';
  const form = w.document.getElementById('payForm');
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));

  const api = findEvent(w, 'add_payment_info');
  check('checkout.html: add_payment_info fires when Pay is pressed with a valid form', !!api);
  check('checkout.html: add_payment_info carries currency USD and the yearly price', !!api && api.currency === 'USD' && api.value === 149.95);
})();

// ── welcome.html ────────────────────────────────────────────────────────────
(function () {
  const url = 'https://leskobusiness.com/welcome?email=' + encodeURIComponent('buyer@example.com') + '&plan=yearly';
  const w = loadPage('welcome.html', url, FORCED_ID);

  const purchase = findEvent(w, 'purchase');
  check('welcome.html: purchase fires once with plan, value and currency USD', !!purchase && purchase.currency === 'USD' && purchase.value === 149.95);

  const configCalls = events(w).filter(function (e) { return e[0] === 'config'; });
  const lastConfig = configCalls[configCalls.length - 1];
  const sentLocation = lastConfig && lastConfig[2] && lastConfig[2].page_location;
  check('welcome.html: page_location was overridden', typeof sentLocation === 'string');
  check('welcome.html: page_location does not carry the email', !!sentLocation && sentLocation.indexOf('buyer%40example.com') === -1 && sentLocation.indexOf('buyer@example.com') === -1);

  const dump = JSON.stringify(events(w));
  check('welcome.html: no dataLayer entry anywhere contains the email', dump.indexOf('buyer@example.com') === -1 && dump.indexOf('buyer%40example.com') === -1);

  // Simulate a reload: run the same inline script again on the same window/session.
  const html = fs.readFileSync(path.join(dir, 'welcome.html'), 'utf8');
  const { scripts } = extractScripts(html);
  const inline = scripts.filter(function (s) { return !s.src; }).pop();
  w.eval(inline.code);
  const purchaseCount = events(w).filter(function (e) { return e[0] === 'event' && e[1] === 'purchase'; }).length;
  check('welcome.html: purchase does not fire again on a simulated reload', purchaseCount === 1);
})();

// ── site-events.js blocked (ad blocker / network error): checkout and welcome must still work ──
(function () {
  const w = loadPage('checkout.html', 'https://leskobusiness.com/checkout?plan=yearly', null, true);
  check('checkout.html: still shows the plan summary when site-events.js is blocked',
    w.document.getElementById('headPlan').textContent === '12 months' &&
    w.document.getElementById('sumPrice').textContent === '$149.95');

  ['first_name', 'last_name', 'address1', 'city', 'state', 'postal_code'].forEach(function (id) {
    w.document.getElementById(id).value = 'x';
  });
  w.document.getElementById('email').value = 'buyer@example.com';
  w.document.getElementById('payForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('checkout.html: pressing Pay does not throw when site-events.js is blocked', w.__scriptErrors.length === 0);
})();

(function () {
  const url = 'https://leskobusiness.com/welcome?email=' + encodeURIComponent('buyer@example.com') + '&plan=yearly';
  const w = loadPage('welcome.html', url, null, true);
  check('welcome.html: still shows the buyer\'s email when site-events.js is blocked',
    w.document.getElementById('emailBox').textContent === 'buyer@example.com');
  check('welcome.html: does not throw when site-events.js is blocked', w.__scriptErrors.length === 0);
})();

// ── off state: empty id sends nothing, on any page ──────────────────────────
['index.html', 'checkout.html', 'welcome.html'].forEach(function (file) {
  const url = file === 'welcome.html'
    ? 'https://leskobusiness.com/welcome?email=buyer@example.com&plan=yearly'
    : file === 'checkout.html'
      ? 'https://leskobusiness.com/checkout?plan=yearly'
      : 'https://leskobusiness.com/';
  const w = loadPage(file, url, null); // no forcedId: whatever GA4_MEASUREMENT_ID ships as
  check(file + ': sends nothing while GA4_MEASUREMENT_ID is empty, as shipped', events(w).length === 0);
});

console.log(failCount === 0 ? 'ALL PASS' : failCount + ' CHECK(S) FAILED');
process.exit(failCount === 0 ? 0 : 1);
