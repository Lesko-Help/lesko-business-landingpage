#!/usr/bin/env node
// Proves the retirement of our own /checkout, as specced in page B5/B5a and worker R5/R6.
// Input: a path to a worker.js file (this repo's, or a scratch copy of another commit made with
// `git archive`). Output: PASS/FAIL lines and an exit code (0 all passed, 1 otherwise), so red
// (today's worker answers 404 or runs subscribe()) and green are each provable from a fresh shell.
//
// How: worker.js is an ES module with no package.json, so Node cannot import it. Same trick as
// scripts/test-subscribe-wallet.js: strip the leading `import` lines, turn `export default` into
// `var workerModule =`, and run the rest as a plain script in a throwaway vm context. Then the
// test calls workerModule.fetch(request, env, ctx) exactly as Cloudflare would.
//
// The `fetch` handed into the sandbox FAILS THE TEST if it is ever called: it is the only road to
// Recurly (subscribe() reaches it through the bare name `fetch`), so "never called" is what
// "never reaches Recurly" means. `alert` is stubbed so nothing is logged for real.
//
// Usage: node scripts/test-checkout-retired.js <path-to-worker.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
if (!workerPath) {
  console.error('usage: test-checkout-retired.js <path-to-worker.js>');
  process.exit(2);
}

const source = fs.readFileSync(workerPath, 'utf8')
  .replace(/^import\s+.*?;\s*$/gm, '')
  .replace('export default', 'var workerModule =');

let outsideCalls = 0;
let limiterCalls = 0; // calls to the stub rate limiter: only subscribe() makes them
const sandbox = {
  console,
  Response,
  Request,
  URL,
  btoa,
  alert: function () {},
  fetch: async function () { outsideCalls++; throw new Error('fetch must not be called'); }
};
vm.createContext(sandbox);
try {
  vm.runInContext(source, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not load as a plain script:', e.message);
  process.exit(1);
}
const worker = sandbox.workerModule;
if (!worker || typeof worker.fetch !== 'function') {
  console.log('FAIL: no default export with fetch() in ' + workerPath);
  process.exit(1);
}

let failCount = 0;
// Input: a label and whether it held. Output: none; prints PASS/FAIL and counts failures.
function check(label, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + label);
  if (!ok) failCount++;
}

// Input: a method, a path with optional query, and an optional body. Output: the Response of
// worker.fetch(). The env has a Recurly key so a leak into subscribe() would be visible as a call
// to the fetch stub, not hidden behind a "payments not switched on" 503.
async function ask(method, pathAndQuery, body) {
  const request = new Request('https://leskobusiness.com' + pathAndQuery, { method, body });
  const env = {
    RECURLY_API_KEY: 'test-key',
    RECURLY_PUBLIC_KEY: 'test-public-key',
    SUBSCRIBE_LIMIT: { limit: async function () { limiterCalls++; return { success: true }; } }
  };
  const ctx = { waitUntil: function () {} };
  try {
    return await worker.fetch(request, env, ctx);
  } catch (e) {
    // A worker that throws is a failed check, not a crashed test: report it as status 0.
    return new Response('threw: ' + e.message, { status: 500, headers: { 'x-threw': '1' } });
  }
}

const MOVED = 'This checkout has moved. Please start again at leskobusiness.com.';
const CF = 'https://checkout.leskobusiness.com/';

(async function () {
  // R5: the old page address redirects to the ClickFunnels page for its plan.
  const redirects = [
    ['/checkout?plan=half-year', 'half-year'],
    ['/checkout?plan=monthly', 'monthly'],
    ['/checkout?plan=yearly', 'yearly'],
    ['/checkout?plan=business-yearly', 'yearly'],
    ['/checkout?plan=business-half-year', 'half-year'],
    ['/checkout', 'monthly'],
    ['/checkout?plan=', 'monthly'],
    ['/checkout?plan=bogus', 'monthly'],
    ['/checkout?plan=business-bogus', 'monthly'],
    ['/checkout/', 'monthly'],
    ['/checkout/?plan=yearly', 'yearly'],
    ['/checkout.html', 'monthly'],
    ['/checkout.html?plan=half-year', 'half-year']
  ];
  for (const [target, plan] of redirects) {
    const res = await ask('GET', target);
    check('GET ' + target + ' -> 302 to ' + CF + plan,
      res.status === 302 && res.headers.get('location') === CF + plan);
    check('GET ' + target + ' is not cached (no-store)', res.headers.get('cache-control') === 'no-store');
  }

  // R6: both API routes answer 410 for any method, before subscribe() can run.
  const gone = [
    ['POST', '/api/subscribe', JSON.stringify({ plan: 'monthly', email: 'a@b.co' })],
    ['GET', '/api/subscribe'],
    ['OPTIONS', '/api/subscribe'],
    ['GET', '/api/config'],
    ['POST', '/api/config', '{}']
  ];
  for (const [method, target, body] of gone) {
    const res = await ask(method, target, body);
    let message;
    try { message = (await res.json()).message; } catch (e) { message = undefined; }
    check(method + ' ' + target + ' -> 410 with the "moved" message', res.status === 410 && message === MOVED);
  }

  // R4 untouched: an unknown path is still a 404.
  const unknown = await ask('GET', '/nothing');
  check('GET /nothing is still 404', unknown.status === 404);

  // The one check that says "never reaches Recurly" for all of the above.
  check('the fetch stub (the only road to Recurly) was never called', outsideCalls === 0);
  check('subscribe() never ran (its rate limiter was never asked)', limiterCalls === 0);

  console.log(failCount === 0 ? 'ALL PASS' : failCount + ' CHECK(S) FAILED');
  process.exit(failCount === 0 ? 0 : 1);
})();
