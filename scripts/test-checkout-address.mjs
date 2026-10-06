#!/usr/bin/env node
// Proves the two "to build, decided 2026-10-06" rules under "The checkout" in
// docs/specs/modules/page.md, without a real browser. Input: a directory holding checkout.html
// and assets/site-events.js (either this repo, or a scratch copy of some other commit made with
// `git archive`). Output: one PASS/FAIL line per check below, and a process exit code (0 only if
// every check passed). Exists so the change from "a non-US buyer is stuck on a US State/ZIP form,
// and a blocked Pay press returns in silence" (red, on origin/main) to "the required address
// fields follow the country, and a blocked Pay press always names the missing field" (green, on
// this branch) is provable from a fresh shell, not just asserted in prose.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: test-checkout-address.mjs <dir>');
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

// Input: checkout.html's own file name plus a stub for window.recurly (or null to leave Recurly
// absent, the way a buyer sees it before js.recurly.com has answered), and the object /api/config
// should resolve with (or null to make it fail, same as a real network error). Output: the JSDOM
// `window` after every local <script> on checkout.html ran, in order, exactly as authored, plus
// window.__scrollTargets (every element scrollIntoView was called on, in call order — scrollIntoView
// itself is a no-op here, jsdom has no layout). Why: every check below needs the page's own
// country-change and submit handlers to have actually run, the same way a visitor's browser would
// run them, but offline and without installing anything into the repo itself.
function loadCheckout(recurlyStub, configResponse) {
  const html = fs.readFileSync(path.join(dir, 'checkout.html'), 'utf8');
  const { scripts, stripped } = extractScripts(html);
  const dom = new JSDOM(stripped, { url: 'https://leskobusiness.com/checkout?plan=yearly', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.__scriptErrors = [];
  window.__scrollTargets = [];
  // /api/config answers with configResponse when given one; otherwise it never answers, the same
  // silent-failure path a real network error takes, and site-events.js and the page's own script
  // must both tolerate that.
  window.fetch = function (url) {
    if (configResponse && String(url).indexOf('/api/config') !== -1) {
      return Promise.resolve({ json: function () { return Promise.resolve(configResponse); } });
    }
    return Promise.reject(new Error('no network in this test'));
  };
  window.IntersectionObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  window.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
  window.Element.prototype.scrollIntoView = function () { window.__scrollTargets.push(this); };
  if (recurlyStub) window.recurly = recurlyStub;
  for (const s of scripts) {
    let code;
    if (s.src) {
      if (!s.src.startsWith('/')) continue; // external CDN scripts (Recurly, GA itself) — not local, not needed
      code = fs.readFileSync(path.join(dir, s.src.replace(/^\//, '')), 'utf8');
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

// Input: a jsdom window from loadCheckout, and the country code to select. Output: none; sets
// #country to that value and fires the 'change' event the page's own listener reacts to.
function selectCountry(w, code) {
  const select = w.document.getElementById('country');
  select.value = code;
  select.dispatchEvent(new w.Event('change', { bubbles: true }));
}

// Input: a jsdom window and a map of field id -> value. Output: none; fills exactly those fields,
// leaving every other field at whatever it already holds (so a test can name only the fields it
// cares about and leave the rest blank, the way a buyer who skips a field does).
function fill(w, values) {
  Object.keys(values).forEach(function (id) {
    w.document.getElementById(id).value = values[id];
  });
}

// Input: a jsdom window with its form already filled as a test wants. Output: the window, after
// dispatching one submit on #payForm — the same event a Pay click raises.
function submit(w) {
  w.document.getElementById('payForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  return w;
}

// Input: nothing. Output: a promise that resolves once every microtask queued so far — including
// ones queued by callbacks those microtasks themselves queue — has run. Why: setupCard() reaches
// `recurly.configure()` only after fetch('/api/config') resolves, its .then(r => r.json()) adopts
// a second promise, and a further .then runs setupCard — several microtask hops, not one.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// ── Rule 1: the required address fields follow the country select ──────────
(function () {
  const w = loadCheckout(null);
  const state = w.document.getElementById('state');
  const postal = w.document.getElementById('postal_code');

  check('checkout.html: the region field reads "State / Province / Region"',
    /State\s*\/\s*Province\s*\/\s*Region/.test(w.document.querySelector('label[for="state"]').textContent));
  check('checkout.html: the postal field reads "Postal code", not "ZIP code"',
    /Postal code/i.test(w.document.querySelector('label[for="postal_code"]').textContent));
  check('checkout.html: the postal field carries no inputmode="numeric" (NL, GB, CA, PL postcodes have letters)',
    !postal.hasAttribute('inputmode'));

  check('checkout.html: US (the page default) requires both state and postal code', state.required === true && postal.required === true);

  selectCountry(w, 'DE');
  check('checkout.html: Germany does not require the region field', state.required === false);
  check('checkout.html: Germany still requires a postal code', postal.required === true);

  selectCountry(w, 'CA');
  check('checkout.html: Canada requires the region field (its gateway checks it)', state.required === true);

  selectCountry(w, 'AU');
  check('checkout.html: Australia requires the region field (its gateway checks it)', state.required === true);

  selectCountry(w, 'AE');
  check('checkout.html: the UAE requires neither region nor postal code (no usable postcode)', state.required === false && postal.required === false);

  ['BS', 'JM', 'TT', 'GH'].forEach(function (code) {
    selectCountry(w, code);
    check('checkout.html: ' + code + ' does not require a postal code', postal.required === false);
  });
})();

// ── Recurly's own required list is cut back to what every country needs ────
await (async function () {
  let capturedConfig = null;
  const recurlyStub = {
    configure: function (opts) { capturedConfig = opts; },
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; },
    token: function () {},
    Risk: function () { return {}; }
  };
  loadCheckout(recurlyStub, { recurly_public_key: 'pk-test' });
  // setupCard runs inside the /api/config promise chain; let it settle before reading the result.
  await flushMicrotasks();
  check('checkout.html: recurly.configure was called', !!capturedConfig);
  const required = (capturedConfig && capturedConfig.required) || [];
  check('checkout.html: Recurly\'s required list no longer names state or postal_code (ours alone decides those)',
    required.indexOf('state') === -1 && required.indexOf('postal_code') === -1);
  ['first_name', 'last_name', 'address1', 'city', 'country'].forEach(function (f) {
    check('checkout.html: Recurly\'s required list still names ' + f, required.indexOf(f) !== -1);
  });
})();

// ── Rule 2: a blocked Pay press always shows why ────────────────────────────
(function () {
  const w = loadCheckout(null);
  const payMsg = w.document.getElementById('payMsg');

  submit(w);
  check('checkout.html: pressing Pay on a fully empty form shows a message, not silence', payMsg.classList.contains('show') && payMsg.textContent.trim().length > 0);
  check('checkout.html: that message names the first missing field (first name)', /first name/i.test(payMsg.textContent));
  check('checkout.html: the page scrolls to the missing field, not just the message box',
    w.__scrollTargets.indexOf(w.document.getElementById('first_name').closest('.field')) !== -1);

  fill(w, { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' });
  submit(w);
  check('checkout.html: with the name and email filled in, the message now names the street address', /street address/i.test(payMsg.textContent));

  fill(w, { address1: 'Rue de la Loi 1', city: 'Brussels' });
  submit(w);
  check('checkout.html: with street and city filled in (country still US), the message names the state/region', /state|province|region/i.test(payMsg.textContent));

  fill(w, { state: 'DC' });
  submit(w);
  check('checkout.html: with the region filled in too, the message names the postal code', /postal code/i.test(payMsg.textContent));
})();

// ── Rule 1 and rule 2 together: a non-US country with its fields filled in reaches Pay ──
await (async function () {
  // A working Recurly stub, so the form gets past "the secure card field is not ready" (a real,
  // separate error this test is not about) and only our own required-field check is on trial.
  const recurlyStub = {
    configure: function () {},
    Elements: function () { return { CardElement: function () { return { attach: function () {}, on: function () {} }; } }; },
    token: function () {}, // never calls back: this test only needs collect() to let Pay proceed
    Risk: function () { return {}; }
  };
  const w = loadCheckout(recurlyStub, { recurly_public_key: 'pk-test' });
  await flushMicrotasks();
  selectCountry(w, 'BE');
  fill(w, {
    first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com',
    address1: 'Rue de la Loi 1', city: 'Brussels', postal_code: '1000'
    // no state: Belgium is not in the region-required list, and this must not block Pay.
  });
  submit(w);
  const payMsg = w.document.getElementById('payMsg');
  check('checkout.html: a Belgian address with no state fills every required field and does not block Pay',
    !payMsg.classList.contains('show'));
})();

process.exit(failCount > 0 ? 1 : 0);
