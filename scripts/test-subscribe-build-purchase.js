#!/usr/bin/env node
// Proves buildPurchase() in worker.js never puts billing_info.ip_address
// onto the Recurly purchase payload — Recurly's v3 /purchases rejects
// ip_address alongside token_id outright (a token already carries billing
// info), so the IP is left off regardless of whether one was given.
// Input: a path to a worker.js file (this repo's, or a scratch copy of
// some other commit via `git archive`). Output: PASS/FAIL lines for a set
// of sample calls, and a process exit code (0 all passed, 1 otherwise) —
// so red (a worker.js that still sets ip_address, e.g. commit 265f225) and
// green (this branch, where the line is removed) are each provable from a
// fresh shell, not just asserted in prose.
//
// worker.js is an ES module (`import ... from './raillog.js'` at the top,
// `export default {...}` at the bottom) but this repo has no package.json,
// so Node would refuse to `import()` it, and `vm`'s Script goal cannot run
// a bare `import` statement either. So: strip the leading import line (the
// only ESM import syntax in the file), cut the trailing `export default`
// block the same way scripts/test-decline-reasons.js already does, and run
// what is left as a plain script in a throwaway vm context. Since this
// test never calls buildPurchase's dependency on `alert` (raillog.js's
// export), the stripped import can simply be deleted — nothing in this
// test's code paths references the name `alert`.
//
// Usage: node scripts/test-subscribe-build-purchase.js <path-to-worker.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
if (!workerPath) {
  console.error('usage: test-subscribe-build-purchase.js <path-to-worker.js>');
  process.exit(2);
}

const source = fs.readFileSync(workerPath, 'utf8');
const withoutImport = source.replace(/^import\s+.*?;\s*$/m, '');
const cut = withoutImport.indexOf('export default');
const scriptBody = cut === -1 ? withoutImport : withoutImport.slice(0, cut);

const sandbox = {};
vm.createContext(sandbox);
try {
  vm.runInContext(scriptBody, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.buildPurchase !== 'function') {
  console.log('FAIL: buildPurchase is not defined in ' + workerPath);
  process.exit(1);
}

let failed = 0;

function check(label, got, expectFn) {
  let ok;
  try {
    ok = expectFn(got);
  } catch (e) {
    console.log('FAIL (' + label + '): threw checking result: ' + e.message);
    failed++;
    return;
  }
  if (ok) {
    console.log('PASS (' + label + ')');
  } else {
    console.log('FAIL (' + label + '): got ' + JSON.stringify(got));
    failed++;
  }
}

const withIp = sandbox.buildPurchase('203.0.113.9', 'monthly', 'tok-1', 'a@b.com', 'A', 'B', '', '');
check('IP given -> billing_info.ip_address still absent (Recurly rejects it alongside token_id)', withIp,
  (p) => p && p.account && p.account.billing_info && !('ip_address' in p.account.billing_info));
check('IP given -> token_id still set', withIp,
  (p) => p.account.billing_info.token_id === 'tok-1');
check('IP given -> plan_code still set', withIp,
  (p) => Array.isArray(p.subscriptions) && p.subscriptions[0].plan_code === 'monthly');

const withoutIp = sandbox.buildPurchase('', 'monthly', 'tok-1', 'a@b.com', 'A', 'B', '', '');
check('no IP -> billing_info.ip_address absent', withoutIp,
  (p) => !('ip_address' in p.account.billing_info));

const withTds = sandbox.buildPurchase('203.0.113.9', 'monthly', 'tok-1', 'a@b.com', 'A', 'B', '', 'tds-token-1');
check('3DS token passed through, IP still absent', withTds,
  (p) => p.account.billing_info.three_d_secure_action_result_token_id === 'tds-token-1'
      && !('ip_address' in p.account.billing_info));

const withCompany = sandbox.buildPurchase('203.0.113.9', 'monthly', 'tok-1', 'a@b.com', 'A', 'B', 'Acme', '');
check('company passed through, IP still absent', withCompany,
  (p) => p.account.company === 'Acme' && !('ip_address' in p.account.billing_info));

if (failed === 0) {
  console.log('PASS: all buildPurchase cases produced the expected payload');
  process.exit(0);
} else {
  console.log('FAIL: ' + failed + ' buildPurchase case(s) did not match');
  process.exit(1);
}
