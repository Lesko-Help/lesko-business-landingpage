#!/usr/bin/env node
// Proves a card decline inside subscribe() actually reaches the real
// sendDeclineAlertEmail() and produces one email to Martin — composing
// the real subscribe() decline branch with the real sendDeclineAlertEmail(),
// not a stub standing in for either (the same approach
// scripts/test-subscribe-decline-alert.js already uses for logDecline()).
// Input: paths to worker.js and raillog.js (this repo's, or a scratch copy
// of some other commit via `git archive`). Output: PASS/FAIL lines and a
// process exit code (0 all passed, 1 otherwise) — so red (no
// sendDeclineAlertEmail, no send_email binding, no cloudflare:email
// import — true of every commit before this task) and green (this
// branch) are each provable from a fresh shell.
//
// Both files are ES modules; this repo has no package.json, so Node
// cannot `import()` either. raillog.js's top-level `export` keywords are
// stripped and run first into a vm context (as in
// scripts/test-subscribe-decline-alert.js); worker.js's leading `import`
// lines are then deleted and its body (up to `export default`) is run
// into THE SAME vm context, with a stub `EmailMessage` class and a stub
// global `fetch` (returning a declined Recurly response) added to the
// sandbox first, so `subscribe()` can run for real without ever reaching
// the network. `console.error`/`console.log` are captured too, so the
// existing BTB_ALERT line can be checked alongside the email — this task
// adds the email, it does not replace the log line.
//
// Usage: node scripts/test-subscribe-decline-email.js <path-to-worker.js> <path-to-raillog.js>

const fs = require('fs');
const vm = require('vm');

const workerPath = process.argv[2];
const raillogPath = process.argv[3];
if (!workerPath || !raillogPath) {
  console.error('usage: test-subscribe-decline-email.js <path-to-worker.js> <path-to-raillog.js>');
  process.exit(2);
}

if (!fs.existsSync(raillogPath)) {
  console.log('FAIL: ' + raillogPath + ' does not exist');
  process.exit(1);
}

const logged = [];
const sentEmails = [];

// Stands in for Recurly: every call declines with a fixed
// transaction_error, the same shape worker.js's subscribe() already
// knows how to read off a real Recurly 402.
async function fakeFetch() {
  return {
    ok: false,
    status: 402,
    json: async () => ({
      error: {
        type: 'transaction',
        transaction_error: {
          code: 'insufficient_funds',
          gateway_error_code: '51',
          message: 'the buyer-facing text — must never appear in the email'
        }
      }
    })
  };
}

// Stands in for the cloudflare:email module's EmailMessage: just records
// what it was constructed with, so the test can inspect the raw MIME
// string sendDeclineAlertEmail() built.
class FakeEmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}

// json()'s `new Response(...)` needs something minimal: a vm context has
// no web-platform globals (Response, fetch, Request, URL, btoa) the way
// workerd does, only plain-JS built-ins, so this reads back status/body
// the same way the real one would for this test's purposes.
class FakeResponse {
  constructor(body, init) {
    this.body = body;
    this.status = (init && init.status) || 200;
    this.headers = (init && init.headers) || {};
  }
  json() { return Promise.resolve(JSON.parse(this.body)); }
}

const sandbox = {
  console: { error: (line) => logged.push(line), log: (line) => logged.push(line) },
  fetch: fakeFetch,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  EmailMessage: FakeEmailMessage,
  Response: FakeResponse
};
vm.createContext(sandbox);

const raillogBody = fs.readFileSync(raillogPath, 'utf8').replace(/^export\s+/gm, '');
try {
  vm.runInContext(raillogBody, sandbox, { filename: raillogPath });
} catch (e) {
  console.log('FAIL: raillog.js did not even load as a plain script:', e.message);
  process.exit(1);
}

const workerSource = fs.readFileSync(workerPath, 'utf8');
const withoutImport = workerSource.replace(/^import\s+.*?;\s*$/gm, '');
const cut = withoutImport.indexOf('export default');
const workerBody = cut === -1 ? withoutImport : withoutImport.slice(0, cut);
try {
  vm.runInContext(workerBody, sandbox, { filename: workerPath });
} catch (e) {
  console.log('FAIL: worker.js did not even load as a plain script:', e.message);
  process.exit(1);
}

if (typeof sandbox.subscribe !== 'function') {
  console.log('FAIL: subscribe is not defined in ' + workerPath);
  process.exit(1);
}
if (typeof sandbox.sendDeclineAlertEmail !== 'function') {
  console.log('FAIL: sendDeclineAlertEmail is not defined in ' + workerPath + ' (not written yet, or worker.js regressed)');
  process.exit(1);
}

// A minimal stand-in for the incoming Request: just enough of the shape
// subscribe() actually reads (method, headers.get, json()).
function fakeRequest(body) {
  return {
    method: 'POST',
    headers: { get: (name) => (name === 'CF-Connecting-IP' ? '81.82.1.1' : null) },
    json: async () => body
  };
}

const waitPromises = [];
const ctx = { waitUntil: (p) => waitPromises.push(p) };
const env = {
  RECURLY_API_KEY: 'test-key',
  SUBSCRIBE_LIMIT: { limit: async () => ({ success: true }) },
  SEND_EMAIL: { send: async (message) => { sentEmails.push(message); } }
};

let failed = 0;

(async () => {
  const request = fakeRequest({
    plan: 'monthly',
    token: 'tok_abc',
    email: 'buyer@example.com',
    first_name: 'Ada',
    last_name: 'Lovelace'
  });

  const response = await sandbox.subscribe(request, env, ctx);
  // sendDeclineAlertEmail runs through ctx.waitUntil, fire-and-forget from
  // subscribe()'s point of view — wait for it here so the email has
  // actually landed in sentEmails before any assertion runs.
  await Promise.all(waitPromises);

  const checks = [];

  checks.push(['subscribe() still answers the buyer with 402', response.status === 402]);

  checks.push(['the existing BTB_ALERT console line still fires (email is additional, not a replacement)',
    logged.some((line) => line.includes('BTB_ALERT') && line.includes('PAYMENT_DECLINED'))]);

  if (sentEmails.length !== 1) {
    checks.push(['exactly one email is sent on a decline', false]);
  } else {
    const msg = sentEmails[0];
    const raw = msg.raw || '';
    checks.push(['exactly one email is sent on a decline', true]);
    checks.push(['subject is exactly "BTB-ALERT lesko-business-landingpage"',
      /^Subject: BTB-ALERT lesko-business-landingpage$/m.test(raw)]);
    checks.push(['body carries the plan code', raw.includes('plan=business-monthly')]);
    checks.push(["body carries Recurly's code", raw.includes('code=insufficient_funds')]);
    checks.push(['body carries the gateway error code', raw.includes('gateway_error_code=51')]);
    checks.push(['body never carries the buyer-facing message text', !raw.includes('buyer-facing text')]);
    checks.push(["body never carries the buyer's email", !raw.includes('buyer@example.com')]);
  }

  for (const [label, ok] of checks) {
    if (ok) {
      console.log('PASS (' + label + ')');
    } else {
      console.log('FAIL (' + label + ')');
      failed++;
    }
  }

  if (failed === 0) {
    console.log('PASS: subscribe() composed with sendDeclineAlertEmail() as expected');
    process.exit(0);
  } else {
    console.log('FAIL: ' + failed + ' subscribe()/sendDeclineAlertEmail() composition case(s) did not match');
    process.exit(1);
  }
})();
