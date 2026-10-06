#!/usr/bin/env node
// Proves a card decline inside subscribe() actually reaches raillog.js's
// alert() and produces a BTB_ALERT line — the real worker.js function
// (logDecline) composed with the real raillog.js function (alert), not a
// stub standing in for either. Input: paths to worker.js and raillog.js
// (this repo's, or a scratch copy of some other commit via `git archive`).
// Output: PASS/FAIL lines and a process exit code (0 all passed, 1
// otherwise) — so red (logDecline does not exist at all, on origin/main
// the decline branch only does `console.log('subscribe declined', ...)`)
// and green (this branch) are each provable from a fresh shell.
//
// Both files are ES modules; this repo has no package.json, so Node
// cannot `import()` either. raillog.js's top-level `export` keywords are
// stripped (as in scripts/test-raillog-alert.js) and run FIRST into a vm
// context; worker.js's leading `import { alert } from './raillog.js'`
// line is then deleted and its body (up to `export default`, as in
// scripts/test-decline-reasons.js) is run into THE SAME vm context, so
// the already-defined `alert` function is the one logDecline's bare
// `alert(...)` call resolves to — proving the wiring, not just that each
// file works alone.
//
// Usage: node scripts/test-subscribe-decline-alert.js <path-to-worker.js> <path-to-raillog.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
const raillogPath = process.argv[3];
if (!workerPath || !raillogPath) {
  console.error('usage: test-subscribe-decline-alert.js <path-to-worker.js> <path-to-raillog.js>');
  process.exit(2);
}

if (!fs.existsSync(raillogPath)) {
  console.log('FAIL: ' + raillogPath + ' does not exist');
  process.exit(1);
}

const logged = [];
const sandbox = { console: { error: (line) => logged.push(line), log: (line) => logged.push(line) } };
vm.createContext(sandbox);

const raillogBody = fs.readFileSync(raillogPath, 'utf8').replace(/^export\s+/gm, '');
try {
  vm.runInContext(raillogBody, sandbox, { filename: raillogPath });
} catch (e) {
  console.log('FAIL: raillog.js did not even load as a plain script:', e.message);
  process.exit(1);
}

const workerSource = fs.readFileSync(workerPath, 'utf8');
const withoutImport = workerSource.replace(/^import\s+.*?;\s*$/m, '');
const cut = withoutImport.indexOf('export default');
const workerBody = cut === -1 ? withoutImport : withoutImport.slice(0, cut);
try {
  vm.runInContext(workerBody, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.logDecline !== 'function') {
  console.log('FAIL: logDecline is not defined in ' + workerPath);
  process.exit(1);
}

let failed = 0;

logged.length = 0;
sandbox.logDecline('monthly', {
  code: 'insufficient_funds',
  gateway_error_code: '51',
  message: 'the buyer-facing text — must never appear in the alert line'
});

if (logged.length !== 1) {
  console.log('FAIL (decline logs exactly one BTB_ALERT line): got ' + logged.length + ' line(s)');
  failed++;
} else {
  const line = logged[0];
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    console.log('FAIL (line is JSON): ' + e.message + ' — line was: ' + line);
    failed++;
    parsed = null;
  }
  if (parsed) {
    const msg = parsed.message || '';
    const checks = [
      ['severity is ERROR', parsed.severity === 'ERROR'],
      ['names the right rail', msg.startsWith('BTB_ALERT lesko-business-landingpage/api-subscribe PAYMENT_DECLINED:')],
      ['carries the plan code', msg.includes('monthly')],
      ["carries Recurly's code", msg.includes('insufficient_funds')],
      ['carries the gateway error code', msg.includes('51')],
      ['never carries the buyer-facing message text', !msg.includes('buyer-facing text')],
    ];
    for (const [label, ok] of checks) {
      if (ok) {
        console.log('PASS (' + label + ')');
      } else {
        console.log('FAIL (' + label + '): line was ' + line);
        failed++;
      }
    }
  }
}

// A decline missing gateway_error_code (Recurly does not always send one)
// must still log, with an empty value rather than throwing.
logged.length = 0;
try {
  sandbox.logDecline('yearly', { code: 'fraud_velocity' });
  if (logged.length === 1) {
    console.log('PASS (decline with no gateway_error_code still logs one line)');
  } else {
    console.log('FAIL (decline with no gateway_error_code): got ' + logged.length + ' line(s)');
    failed++;
  }
} catch (e) {
  console.log('FAIL (decline with no gateway_error_code should not throw): ' + e.message);
  failed++;
}

if (failed === 0) {
  console.log('PASS: logDecline composed with raillog.js alert() as expected');
  process.exit(0);
} else {
  console.log('FAIL: ' + failed + ' logDecline/alert composition case(s) did not match');
  process.exit(1);
}
