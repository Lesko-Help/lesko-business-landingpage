#!/usr/bin/env node
// Proves raillog.js's alert(runnable, code, what): prints exactly one
// console.error line, shaped as the JSON Cloud Monitoring's BTB_ALERT
// log-based metric matches on (severity ERROR, message "BTB_ALERT
// lesko-business-landingpage/<runnable> <CODE>: <what>"), and refuses a
// code outside its fixed allow-list instead of silently printing a line no
// policy will ever match. Input: a path to a raillog.js file. Output:
// PASS/FAIL lines and a process exit code (0 all passed, 1 otherwise) — so
// red (the file does not exist at all, on origin/main) and green (this
// branch) are each provable from a fresh shell.
//
// raillog.js is an ES module (`export function alert(...)`, `export const
// ALERT_CODES = ...`), and this repo has no package.json, so Node cannot
// `import()` it. The only ESM syntax in the file is the leading `export`
// keyword on each top-level declaration, so stripping that (and nothing
// else) turns it into a plain script vm can run — the same trick
// scripts/test-decline-reasons.js already uses by cutting at `export
// default`, adapted here because raillog.js has several named exports
// instead of one default export at the end.
//
// Usage: node scripts/test-raillog-alert.js <path-to-raillog.js>

const fs = require('fs');
const vm = require('vm');

const raillogPath = process.argv[2];
if (!raillogPath) {
  console.error('usage: test-raillog-alert.js <path-to-raillog.js>');
  process.exit(2);
}

if (!fs.existsSync(raillogPath)) {
  console.log('FAIL: ' + raillogPath + ' does not exist');
  process.exit(1);
}

const source = fs.readFileSync(raillogPath, 'utf8');
const scriptBody = source.replace(/^export\s+/gm, '');

const logged = [];
const sandbox = { console: { error: (line) => logged.push(line), log: (line) => logged.push(line) } };
vm.createContext(sandbox);
try {
  vm.runInContext(scriptBody, sandbox, { filename: raillogPath });
} catch (e) {
  console.log('FAIL: raillog.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.alert !== 'function') {
  console.log('FAIL: alert is not defined in ' + raillogPath);
  process.exit(1);
}

let failed = 0;

logged.length = 0;
sandbox.alert('api-subscribe', 'PAYMENT_DECLINED', 'plan=monthly code=insufficient_funds gateway_error_code=51');
if (logged.length !== 1) {
  console.log('FAIL (valid code logs exactly one line): got ' + logged.length + ' line(s)');
  failed++;
} else {
  let parsed;
  try {
    parsed = JSON.parse(logged[0]);
  } catch (e) {
    console.log('FAIL (line is JSON): ' + e.message + ' — line was: ' + logged[0]);
    failed++;
    parsed = null;
  }
  if (parsed) {
    const expectedMessage = 'BTB_ALERT lesko-business-landingpage/api-subscribe PAYMENT_DECLINED: plan=monthly code=insufficient_funds gateway_error_code=51';
    if (parsed.severity === 'ERROR' && parsed.message === expectedMessage) {
      console.log('PASS (valid code -> exact BTB_ALERT line): ' + logged[0]);
    } else {
      console.log('FAIL (valid code -> exact BTB_ALERT line): got ' + logged[0]);
      failed++;
    }
  }
}

let threw = false;
try {
  sandbox.alert('api-subscribe', 'NOT_A_REAL_CODE', 'should never print');
} catch (e) {
  threw = true;
}
if (threw) {
  console.log('PASS (unknown code throws instead of printing a line no policy matches)');
} else {
  console.log('FAIL (unknown code should have thrown)');
  failed++;
}

if (failed === 0) {
  console.log('PASS: all raillog.js alert() cases matched');
  process.exit(0);
} else {
  console.log('FAIL: ' + failed + ' raillog.js alert() case(s) did not match');
  process.exit(1);
}
