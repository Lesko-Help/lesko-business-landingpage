#!/usr/bin/env node
// Proves assets/wallet-common.js against docs/specs/modules/wallets.md C1-C6. Input: a path to that
// file (this repo's, or a scratch copy of some other commit via `git archive`). Output: PASS/FAIL
// lines and a process exit code (0 all passed, 1 otherwise) — so red (origin/main has no such file at
// all) and green (this branch) are each provable from a fresh shell.
//
// wallet-common.js is a plain browser script (no import/export — it assigns window.LeskoWallets
// directly), so it is run as-is in a throwaway vm context with stubbed globals: `window` (the same
// object as the sandbox's global, as a real page's `window` is), `document.getElementById` (a fake
// element per id, carrying just the `.value` wallet-common.js reads for the company field), `fetch`
// (a spy recording every call, answering a programmable response) and `window.LeskoCheckout` /
// `window.LeskoAnalytics` (spies recording every call they receive).
//
// Usage: node scripts/test-wallet-common.js <path-to-wallet-common.js>

const fs = require('fs');
const vm = require('vm');

const filePath = process.argv[2];
if (!filePath) {
  console.error('usage: test-wallet-common.js <path-to-wallet-common.js>');
  process.exit(2);
}

const source = fs.readFileSync(filePath, 'utf8');

let failed = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log('PASS (' + label + ')');
  } else {
    console.log('FAIL (' + label + ')' + (extra ? ': ' + extra : ''));
    failed++;
  }
}

// Input: nothing. Output: a promise that resolves after enough microtask turns for
// payWithWallet's fetch().then().then() chain to have fully settled — one tick alone is not
// enough, since there are two .then()s between the fetch call and the finish()/showError call.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// Input: an optional company field value, an optional fetch behaviour and an optional plan.
// Output: a fresh sandbox with wallet-common.js already run in it, plus the spies the test reads
// back out. A fresh one per test, so no call made by one test can leak into the next.
function load(opts) {
  opts = opts || {};
  const fetchCalls = [];
  const financeCalls = { showError: [], finish: [], track: [] };
  const companyValue = opts.companyValue === undefined ? 'Acme Co' : opts.companyValue;

  const sandbox = {
    console,
    document: {
      getElementById: function (id) {
        if (id === 'company') return { value: companyValue };
        return null;
      }
    },
    fetch: function (url, init) {
      fetchCalls.push({ url: url, init: init });
      if (opts.fetchReject) return Promise.reject(new Error('network down'));
      return Promise.resolve({ json: function () { return Promise.resolve(opts.fetchResult || { ok: true }); } });
    }
  };
  sandbox.window = sandbox;
  sandbox.window.LeskoCheckout = {
    plan: function () { return opts.plan || 'monthly'; },
    showError: function (msg) { financeCalls.showError.push(msg); },
    finish: function (result, tokenId, buyerEmail) { financeCalls.finish.push({ result: result, tokenId: tokenId, buyerEmail: buyerEmail }); }
  };
  sandbox.window.LeskoAnalytics = {
    planPriceUSD: function (plan) { return ({ monthly: 29.95, 'half-year': 89.95, yearly: 149.95 })[plan]; },
    track: function (name, params) { financeCalls.track.push({ name: name, params: params }); }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: filePath });

  return { sandbox: sandbox, fetchCalls: fetchCalls, financeCalls: financeCalls };
}

async function main() {
  // ── C1: all three flags ship false, and isOn() reports them. ──
  {
    const { sandbox } = load();
    const w = sandbox.window.LeskoWallets;
    check('window.LeskoWallets exists', !!w);
    if (!w) { console.log('FAIL: cannot run the rest of the checks without LeskoWallets'); process.exit(1); }
    check('WALLETS.paypal ships false', w.WALLETS.paypal === false);
    check('WALLETS.apple_pay ships false', w.WALLETS.apple_pay === false);
    check('WALLETS.google_pay ships false', w.WALLETS.google_pay === false);
    check('isOn("paypal") reports the paypal flag', w.isOn('paypal') === w.WALLETS.paypal);
    w.WALLETS.google_pay = true;
    check('isOn() reads the live flag, not a snapshot', w.isOn('google_pay') === true);
  }

  // ── C2: the exact POST body, including wallet, and finish() gets both extra arguments. ──
  {
    const { sandbox, fetchCalls, financeCalls } = load({ plan: 'yearly', companyValue: 'Acme Co', fetchResult: { ok: true } });
    sandbox.window.LeskoWallets.payWithWallet('paypal', 'tok-pp', { email: 'a@b.co', first_name: 'Ada', last_name: 'Lovelace' });
    await flushMicrotasks();
    check('payWithWallet POSTs to /api/subscribe', fetchCalls.length === 1 && fetchCalls[0].url === '/api/subscribe', JSON.stringify(fetchCalls));
    const body = fetchCalls.length === 1 ? JSON.parse(fetchCalls[0].init.body) : {};
    check('POST body carries plan/token/email/first_name/last_name/company/wallet',
      body.plan === 'yearly' && body.token === 'tok-pp' && body.email === 'a@b.co' &&
      body.first_name === 'Ada' && body.last_name === 'Lovelace' && body.company === 'Acme Co' &&
      body.wallet === 'paypal',
      JSON.stringify(body));
    check('finish() is called with the result, the token id and the buyer email (K3a/K3b)',
      financeCalls.finish.length === 1 &&
      financeCalls.finish[0].tokenId === 'tok-pp' &&
      financeCalls.finish[0].buyerEmail === 'a@b.co' &&
      financeCalls.finish[0].result.ok === true,
      JSON.stringify(financeCalls.finish));
  }

  // ── C2 amendment (2026-10-09): the email is normalised once, the same way the card path's own
  // subscribe() already normalises it, so it reaches the POST body and finish() identically no
  // matter how the wallet cased or padded it.
  {
    const { sandbox, fetchCalls, financeCalls } = load({ plan: 'monthly' });
    sandbox.window.LeskoWallets.payWithWallet('paypal', 'tok-norm', { email: '  Buyer@Example.COM  ' });
    await flushMicrotasks();
    check('an upper-case, space-padded wallet email is normalised before the POST (K3b amendment)',
      fetchCalls.length === 1 && JSON.parse(fetchCalls[0].init.body).email === 'buyer@example.com',
      JSON.stringify(fetchCalls));
    check('the same normalised email reaches finish() (K3b amendment)',
      financeCalls.finish.length === 1 && financeCalls.finish[0].buyerEmail === 'buyer@example.com',
      JSON.stringify(financeCalls.finish));
  }

  // ── C3: an empty buyer.email is refused before any POST, with a named error. ──
  {
    const { sandbox, fetchCalls, financeCalls } = load({ plan: 'monthly' });
    sandbox.window.LeskoWallets.payWithWallet('paypal', 'tok-pp', { email: '' });
    await flushMicrotasks();
    check('an empty buyer.email makes no POST at all (C3)', fetchCalls.length === 0, JSON.stringify(fetchCalls));
    check('an empty buyer.email shows an error naming the wallet (C3)',
      financeCalls.showError.length === 1 && financeCalls.showError[0].indexOf('PayPal') !== -1,
      JSON.stringify(financeCalls.showError));
  }

  // ── C4: one add_payment_info event with payment_type set per method. ──
  {
    const { sandbox, financeCalls } = load({ plan: 'half-year' });
    sandbox.window.LeskoWallets.payWithWallet('paypal', 'tok-1', { email: 'a@b.co' });
    await flushMicrotasks();
    const events = financeCalls.track.filter(function (c) { return c.name === 'add_payment_info'; });
    check('exactly one add_payment_info event fires before the POST (C4)', events.length === 1, JSON.stringify(financeCalls.track));
    check('its payment_type is "PayPal" (C4)', events.length === 1 && events[0].params.payment_type === 'PayPal', JSON.stringify(events));
    check('its value is the plan price (C4)', events.length === 1 && events[0].params.value === 89.95, JSON.stringify(events));
  }

  // ── C5: a rejected fetch shows the generic sentence, and posts exactly once. ──
  {
    const { sandbox, fetchCalls, financeCalls } = load({ plan: 'monthly', fetchReject: true });
    sandbox.window.LeskoWallets.payWithWallet('paypal', 'tok-1', { email: 'a@b.co' });
    await flushMicrotasks();
    check('a network failure posts exactly once (no retry — a wallet token is single use) (C5)',
      fetchCalls.length === 1, JSON.stringify(fetchCalls));
    check('a network failure shows the card path\'s generic sentence (C5)',
      financeCalls.showError.length === 1 &&
      financeCalls.showError[0] === 'The payment did not go through. Please check your card details and try again.',
      JSON.stringify(financeCalls.showError));
  }

  // ── C6: the file is inert — no throw — when loaded on a page with no window.LeskoCheckout. ──
  {
    const noSeamSandbox = { console, document: { getElementById: function () { return null; } }, fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); } };
    noSeamSandbox.window = noSeamSandbox;
    vm.createContext(noSeamSandbox);
    let threw = null;
    try {
      vm.runInContext(source, noSeamSandbox, { filename: filePath });
    } catch (e) {
      threw = e;
    }
    check('the file loads without window.LeskoCheckout present, without throwing (C6)', !threw, threw && threw.message);
    check('it still defines window.LeskoWallets even with no LeskoCheckout (C6)', !!(noSeamSandbox.window && noSeamSandbox.window.LeskoWallets));
  }

  if (failed === 0) {
    console.log('PASS: assets/wallet-common.js matches C1-C6');
    process.exit(0);
  } else {
    console.log('FAIL: ' + failed + ' wallet-common case(s) did not match');
    process.exit(1);
  }
}

main().catch(function (e) {
  console.log('FAIL: unexpected error:', e.stack || e.message);
  process.exit(1);
});
