#!/usr/bin/env node
// Proves declineMessage() in worker.js turns Recurly's transaction_error
// into a plain-language buyer message. Input: a path to a worker.js file
// (this repo's, or a scratch copy of some other commit via `git archive`).
// Output: PASS/FAIL lines for a set of sample transaction_error objects,
// and a process exit code (0 all passed, 1 otherwise) — so red (function
// missing, on origin/main) and green (function present, on this branch)
// are each provable from a fresh shell, not just asserted in prose.
//
// worker.js is an ES module (`export default {...}`) but this repo has no
// package.json, so Node would refuse to `import()` it. Since the only ESM
// syntax in the file is that trailing export, we read the source, cut it
// off before `export default`, and run the rest as a plain script in a
// throwaway vm context — no changes to worker.js's module shape needed.
//
// Usage: node scripts/test-decline-reasons.js <path-to-worker.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
if (!workerPath) {
  console.error('usage: test-decline-reasons.js <path-to-worker.js>');
  process.exit(2);
}

const source = fs.readFileSync(workerPath, 'utf8');
const cut = source.indexOf('export default');
const scriptBody = cut === -1 ? source : source.slice(0, cut);

const sandbox = {};
vm.createContext(sandbox);
try {
  vm.runInContext(scriptBody, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.declineMessage !== 'function') {
  console.log('FAIL: declineMessage is not defined in ' + workerPath);
  process.exit(1);
}

// [transaction_error sample, substring expected in the buyer message, label]
const cases = [
  [{ code: 'insufficient_funds', message: 'gateway said no' }, 'insufficient funds', 'insufficient funds'],
  [{ code: 'expired_card', message: 'gateway said no' }, 'expired', 'expired card'],
  [{ code: 'declined_security_code', message: 'gateway said no' }, 'security code (CVV)', 'wrong CVV'],
  [{ code: 'fraud_address', message: 'gateway said no' }, 'billing address or ZIP', 'AVS mismatch'],
  [{ code: 'invalid_card_number', message: 'gateway said no' }, 'card number is not valid', 'invalid card number'],
  [{ code: 'card_type_not_accepted', message: 'gateway said no' }, 'card type is not accepted', 'card type not accepted'],
  [{ code: 'call_issuer', message: 'gateway said no' }, 'call them', 'bank wants a call'],
  [{ code: 'gateway_timeout', message: 'gateway said no' }, 'temporarily unavailable', 'gateway unavailable'],
  [{ code: 'duplicate_transaction', message: 'gateway said no' }, 'same charge was just submitted', 'duplicate transaction'],
  // A fraud_* code not in the named list must fall back to the two safe
  // hints, and must NOT leak the gateway's own message text.
  [{ code: 'fraud_velocity', message: 'too many attempts from this card in a short time, likely automated' }, 'billing address and ZIP', 'unlisted fraud code hides gateway detail'],
  // A completely unknown, non-fraud code falls back to Recurly's own message.
  [{ code: 'some_future_code', message: 'Recurly wrote this for you' }, 'Recurly wrote this for you', 'unknown code falls back to Recurly message'],
  // No code and no message at all falls back to today's generic text.
  [{}, 'Please try another card or contact your bank', 'no data falls back to generic text']
];

let failed = 0;
for (const [te, expectSubstring, label] of cases) {
  let got;
  try {
    got = sandbox.declineMessage(te);
  } catch (e) {
    console.log('FAIL (' + label + '): declineMessage threw: ' + e.message);
    failed++;
    continue;
  }
  if (typeof got !== 'string' || !got.includes(expectSubstring)) {
    console.log('FAIL (' + label + '): got ' + JSON.stringify(got) + ', expected it to include ' + JSON.stringify(expectSubstring));
    failed++;
  } else {
    console.log('PASS (' + label + '): ' + got);
  }
}

if (failed === 0) {
  console.log('PASS: all ' + cases.length + ' decline-reason cases mapped as expected');
  process.exit(0);
} else {
  console.log('FAIL: ' + failed + ' of ' + cases.length + ' decline-reason cases did not match');
  process.exit(1);
}
