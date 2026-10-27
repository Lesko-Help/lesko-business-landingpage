// Proves clickfunnels/paypal-button.html (page spec B1a, PP1-PP5) without a browser or the network.
// Input: the snippet's path and assets/wallet-paypal.js's path (run through
// scripts/test-cf-paypal-button.sh). Output: PASS/FAIL lines and exit code 0 only if all passed.
//
// How: for each page path the snippet is loaded into a fresh jsdom page. Its <script> is run by
// hand inside a function that takes `location` as a parameter, so the snippet's bare `location`
// is a fake we can read (jsdom cannot navigate). The SDK <script src> the snippet appends is never
// fetched; the test reads its URL, installs a stub `paypal` global and calls the tag's onload, as
// the real SDK would. setTimeout is replaced so the 5 s email-lookup limit can be fired at once.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const snippetPath = process.argv[2];
const walletPath = process.argv[3];
const html = fs.readFileSync(snippetPath, 'utf8');
const wallet = fs.readFileSync(walletPath, 'utf8');

let failCount = 0;
// Input: a label and whether it held. Output: none; prints PASS/FAIL and counts failures.
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failCount++;
}

const PLAN_IDS = {
  'monthly': 'P-7R176589BE0160805NLJVCFI',
  'half-year': 'P-2GV64945HR320740CNLIP2HY',
  'yearly': 'P-8M862053KT491162FNLJVCFI'
};
const CLIENT_ID = /PAYPAL_CLIENT_ID = '([^']*)'/.exec(wallet)[1];

const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
const markup = html.replace(/<script>[\s\S]*?<\/script>/, '');

// Input: a page path. Output: { w, loc, timers, sdkTag, errors } after the snippet ran there:
// w the jsdom window, loc the fake location (loc.assigned lists every navigation), timers the
// setTimeout calls the snippet made, sdkTag the PayPal <script> it added (or null).
function load(pathname) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + markup + '</body></html>',
    { url: 'https://checkout.leskobusiness.com' + pathname, runScripts: 'outside-only' });
  const w = dom.window;
  const loc = { pathname, assigned: [], assign: function (u) { loc.assigned.push(u); } };
  const timers = [];
  w.setTimeout = function (fn, ms) { timers.push({ fn, ms }); return timers.length; };
  w.clearTimeout = function () {};
  w.alert = function () { throw new Error('window.alert must never be used'); };
  w.eval('(function (location) {' + scriptMatch[1] + '})')(loc);
  const sdkTag = w.document.head.querySelector('script[src]');
  return { w, loc, timers, sdkTag };
}

// Input: a page, and the stub's behaviour. Output: the options object the snippet handed to
// paypal.Buttons(), after the SDK "loaded"; also records the render target.
function loadSdk(page) {
  const out = { options: null, renderedInto: null };
  page.w.paypal = {
    Buttons: function (options) {
      out.options = options;
      return { render: function (el) { out.renderedInto = el; } };
    }
  };
  page.sdkTag.onload();
  return out;
}

// Input: a promise. Output: it, after the microtask queue has drained, so .then callbacks ran.
const settle = () => new Promise(function (r) { setImmediate(r); });

(async function () {
  // PP1: nothing loads on a path that names no plan.
  for (const p of ['/', '/other', '/monthly-x', '/constructor']) {
    const page = load(p);
    check('PP1: ' + p + ' adds no PayPal script', !page.sdkTag);
  }
  // PP1: no container, no script.
  {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only' });
    const loc = { pathname: '/monthly', assign: function () {} };
    dom.window.eval('(function (location) {' + scriptMatch[1] + '})')(loc);
    check('PP1: a missing container adds no PayPal script', !dom.window.document.head.querySelector('script[src]'));
  }

  for (const plan of Object.keys(PLAN_IDS)) {
    const id = PLAN_IDS[plan];
    for (const suffix of ['', '/']) {
      const p = '/' + plan + suffix;
      const page = load(p);
      check('PP2: ' + p + ' adds exactly one PayPal SDK script', !!page.sdkTag &&
        page.w.document.head.querySelectorAll('script[src]').length === 1);
      if (!page.sdkTag) continue;
      const url = new URL(page.sdkTag.src);
      check('PP2: ' + p + ' SDK host and path', url.origin + url.pathname === 'https://www.paypal.com/sdk/js');
      check('PP2: ' + p + ' SDK client-id equals wallet-paypal.js\'s', url.searchParams.get('client-id') === CLIENT_ID);
      check('PP2: ' + p + ' SDK query is vault/subscription/USD/buttons/no card',
        url.searchParams.get('vault') === 'true' && url.searchParams.get('intent') === 'subscription' &&
        url.searchParams.get('currency') === 'USD' && url.searchParams.get('components') === 'buttons' &&
        url.searchParams.get('disable-funding') === 'card');
    }

    const page = load('/' + plan);
    const sdk = loadSdk(page);
    check('PP3: /' + plan + ' renders into its own container',
      sdk.renderedInto === page.w.document.getElementById('lesko-paypal-button'));
    const created = [];
    const planArg = await sdk.options.createSubscription({}, { subscription: { create: function (a) { created.push(a); return 'sub'; } } });
    check('PP3: /' + plan + ' creates the subscription on ' + id + ' and nothing else',
      planArg === 'sub' && created.length === 1 && JSON.stringify(created[0]) === JSON.stringify({ plan_id: id }));
    check('PP3: the id equals wallet-paypal.js\'s for ' + plan,
      wallet.indexOf("'" + plan + "': '" + id + "'") !== -1);
  }

  // PP4: onApprove, per plan and per email behaviour.
  for (const plan of Object.keys(PLAN_IDS)) {
    const welcome = 'https://leskobusiness.com/welcome?plan=business-' + plan;
    let page = load('/' + plan);
    let sdk = loadSdk(page);
    await sdk.options.onApprove({ subscriptionID: 'I-1' },
      { subscription: { get: async function () { return { subscriber: { email_address: ' Buyer+Tag@Example.COM ' } }; } } });
    check('PP4: /' + plan + ' approve with an email -> ' + welcome + '&email=buyer%2Btag%40example.com',
      page.loc.assigned.length === 1 && page.loc.assigned[0] === welcome + '&email=buyer%2Btag%40example.com');

    page = load('/' + plan);
    sdk = loadSdk(page);
    await sdk.options.onApprove({ subscriptionID: 'I-1' }, { subscription: { get: async function () { return {}; } } });
    check('PP4: /' + plan + ' approve without an email -> ' + welcome, page.loc.assigned.join() === welcome);
  }
  {
    // A lookup that rejects, throws, or is missing still navigates, without the email.
    const welcome = 'https://leskobusiness.com/welcome?plan=business-yearly';
    const cases = {
      rejects: { subscription: { get: function () { return Promise.reject(new Error('x')); } } },
      throws: { subscription: { get: function () { throw new Error('x'); } } },
      absent: {}
    };
    for (const [name, actions] of Object.entries(cases)) {
      const page = load('/yearly');
      const sdk = loadSdk(page);
      await sdk.options.onApprove({ subscriptionID: 'I-1' }, actions);
      check('PP4: a lookup that ' + name + ' still navigates, without the email', page.loc.assigned.join() === welcome);
    }
    // A lookup that never answers: the 5 s timer fires and the buyer still goes through.
    const page = load('/yearly');
    const sdk = loadSdk(page);
    const pending = sdk.options.onApprove({ subscriptionID: 'I-1' }, { subscription: { get: function () { return new Promise(function () {}); } } });
    await settle();
    check('PP4: a hanging lookup waits (no navigation before the limit)', page.loc.assigned.length === 0);
    check('PP4: the limit is 5000 ms', page.timers.length === 1 && page.timers[0].ms === 5000);
    page.timers[0].fn();
    await pending;
    check('PP4: after the limit the buyer still navigates, without the email', page.loc.assigned.join() === welcome);
  }

  // PP5: failures go to our own line, never window.alert; cancel shows nothing.
  {
    const page = load('/monthly');
    const sdk = loadSdk(page);
    const line = page.w.document.getElementById('lesko-paypal-message');
    sdk.options.onError(new Error('boom'));
    check('PP5: onError writes PayPal did not go through in the message line', /PayPal did not go through/.test(line.textContent));
    line.textContent = '';
    await sdk.options.onApprove({}, {});
    check('PP5: an approval with no subscription id says we could not confirm, and does not navigate',
      /could not confirm your PayPal payment.*contact support before trying again/.test(line.textContent) && page.loc.assigned.length === 0);
    line.textContent = '';
    check('PP5: a plain cancel shows nothing (no onCancel message)',
      (typeof sdk.options.onCancel !== 'function' || (sdk.options.onCancel(), line.textContent === '')));
  }

  // PP6: no secret in the file.
  check('PP6: no client secret in the snippet', !/secret/i.test(html.replace(/client SECRET never appears here/g, '')));

  console.log(failCount === 0 ? 'ALL PASS' : failCount + ' CHECK(S) FAILED');
  process.exit(failCount === 0 ? 0 : 1);
})();
