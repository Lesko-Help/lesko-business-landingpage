#!/usr/bin/env node
// Proves the wallet branch of subscribe() and buildPurchase() in worker.js, as specced in
// docs/specs/modules/wallets.md W1-W3. Input: a path to a worker.js file (this repo's, or a
// scratch copy of some other commit via `git archive`). Output: PASS/FAIL lines and a process
// exit code (0 all passed, 1 otherwise) — so red (origin/main has no `wallet` field at all: every
// body still needs first_name/last_name, and billing_info/first_name/last_name are set
// unconditionally) and green (this branch) are each provable from a fresh shell.
//
// worker.js is an ES module (`import { alert } from './raillog.js'` at the top, `export default
// {...}` at the bottom) but this repo has no package.json, so Node cannot `import()` it, and
// vm's Script goal cannot run a bare `import` statement either. So: strip the leading import
// line, cut the source off before `export default`, and run what is left as a plain script in a
// throwaway vm context, the same way scripts/test-decline-reasons.js and
// scripts/test-subscribe-build-purchase.js already do. `alert` is stubbed directly here (recording
// every call) rather than composed with the real raillog.js — scripts/test-subscribe-decline-alert.js
// already proves that composition; this test only needs to see what logDecline passes it.
// subscribe() itself reaches Recurly through the bare name `fetch`, so a stub is given for that
// too, so no real network call is ever made. Response and btoa are Node's own globals (18+),
// handed into the sandbox because subscribe() builds its answers with the json() helper, which
// calls `new Response(...)`, and signs the Recurly call with `btoa(...)`.
//
// Usage: node scripts/test-subscribe-wallet.js <path-to-worker.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
if (!workerPath) {
  console.error('usage: test-subscribe-wallet.js <path-to-worker.js>');
  process.exit(2);
}

const source = fs.readFileSync(workerPath, 'utf8');
const withoutImport = source.replace(/^import\s+.*?;\s*$/m, '');
const cut = withoutImport.indexOf('export default');
const scriptBody = cut === -1 ? withoutImport : withoutImport.slice(0, cut);

let fetchResponse = { ok: true, json: async () => ({}) };
const alertCalls = [];
const sandbox = {
  console,
  Response,
  btoa,
  alert: function (...args) { alertCalls.push(args); },
  fetch: async function () { return fetchResponse; }
};
vm.createContext(sandbox);
try {
  vm.runInContext(scriptBody, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.subscribe !== 'function') {
  console.log('FAIL: subscribe is not defined in ' + workerPath);
  process.exit(1);
}
if (typeof sandbox.buildPurchase !== 'function') {
  console.log('FAIL: buildPurchase is not defined in ' + workerPath);
  process.exit(1);
}
if (typeof sandbox.logDecline !== 'function') {
  console.log('FAIL: logDecline is not defined in ' + workerPath);
  process.exit(1);
}

let failed = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log('PASS (' + label + ')');
  } else {
    console.log('FAIL (' + label + ')' + (extra ? ': ' + extra : ''));
    failed++;
  }
}

// Input: the JSON body /api/subscribe would receive. Output: a fake Request object carrying
// just what subscribe() reads from it (method, a header lookup that always answers null — the
// caller IP is irrelevant to these checks — and the parsed body itself).
function makeRequest(body) {
  return { method: 'POST', headers: { get: () => null }, json: async () => body };
}
const env = { RECURLY_API_KEY: 'test-key', SUBSCRIBE_LIMIT: { limit: async () => ({ success: true }) } };

async function main() {
  // ── W1: the three wallet values pass without a name; a fourth is rejected; ──
  // ── a body with no wallet and no names is still rejected. ───────────────────
  for (const wallet of ['paypal', 'apple_pay', 'google_pay']) {
    fetchResponse = { ok: true, json: async () => ({}) };
    const res = await sandbox.subscribe(makeRequest({
      plan: 'monthly', token: 'tok-1', email: 'a@b.com', wallet
    }), env);
    check('wallet=' + wallet + ' with no name passes validation', res.status === 201, 'got ' + res.status);
  }

  {
    const res = await sandbox.subscribe(makeRequest({
      plan: 'monthly', token: 'tok-1', email: 'a@b.com', wallet: 'bitcoin'
    }), env);
    check('an unknown wallet value is rejected', res.status === 400, 'got ' + res.status);
  }

  {
    const res = await sandbox.subscribe(makeRequest({
      plan: 'monthly', token: 'tok-1', email: 'a@b.com'
    }), env);
    check('no wallet and no names is still rejected (the card path is unchanged)', res.status === 400, 'got ' + res.status);
  }

  {
    fetchResponse = { ok: true, json: async () => ({}) };
    const res = await sandbox.subscribe(makeRequest({
      plan: 'monthly', token: 'tok-1', email: 'a@b.com', first_name: 'Ada', last_name: 'Lovelace'
    }), env);
    check('no wallet, with names, still passes (the card path still works)', res.status === 201, 'got ' + res.status);
  }

  // ── W3: buildPurchase's billing_info carries exactly one key for a wallet, ──
  // ── and absent (not empty-string) names. ────────────────────────────────────
  const walletPurchase = sandbox.buildPurchase('203.0.113.9', 'business-monthly', 'tok-pp', 'a@b.com', '', '', '', '');
  check('wallet purchase: billing_info has exactly one key (token_id)',
    Object.keys(walletPurchase.account.billing_info).length === 1 && walletPurchase.account.billing_info.token_id === 'tok-pp',
    JSON.stringify(walletPurchase.account.billing_info));
  check('wallet purchase: first_name is absent, not an empty string', !('first_name' in walletPurchase.account));
  check('wallet purchase: last_name is absent, not an empty string', !('last_name' in walletPurchase.account));

  const cardPurchase = sandbox.buildPurchase('203.0.113.9', 'business-monthly', 'tok-card', 'a@b.com', 'Ada', 'Lovelace', '', '');
  check('card purchase: first_name is still set', cardPurchase.account.first_name === 'Ada');
  check('card purchase: last_name is still set', cardPurchase.account.last_name === 'Lovelace');
  check('card purchase: billing_info still has exactly one key (token_id)', Object.keys(cardPurchase.account.billing_info).length === 1);

  // ── W2: the decline alert line names which wallet (or 'card') made the purchase. ──
  alertCalls.length = 0;
  sandbox.logDecline('monthly', { code: 'insufficient_funds', gateway_error_code: '51', message: 'buyer-facing text — must never appear in the alert' }, 'paypal');
  check('decline alert fires exactly once for a wallet decline', alertCalls.length === 1, 'got ' + alertCalls.length);
  if (alertCalls.length === 1) {
    const line = alertCalls[0][2] || '';
    check('decline alert line carries wallet=paypal', line.includes('wallet=paypal'), line);
    check('decline alert line never carries the buyer-facing message text', !line.includes('buyer-facing text'), line);
    check('decline alert line never carries an email address', !line.includes('a@b.com'), line);
  }

  alertCalls.length = 0;
  sandbox.logDecline('monthly', { code: 'insufficient_funds' });
  check('a card decline (no wallet argument) still logs wallet=card', alertCalls.length === 1 && (alertCalls[0][2] || '').includes('wallet=card'));

  if (failed === 0) {
    console.log('PASS: subscribe()/buildPurchase()/logDecline() all handle the wallet branch as specced');
    process.exit(0);
  } else {
    console.log('FAIL: ' + failed + ' wallet case(s) did not match');
    process.exit(1);
  }
}

main();
