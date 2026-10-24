// Buys ONE real sandbox subscription through the locally served copy of /checkout,
// with the email box LEFT EMPTY — the case the live code changed on 2026-10-23.
//
// Input : argv[2] the plan key (monthly | half-year | yearly), argv[3] the base URL
//         the server is on, argv[4] the plan map written by paypal-sandbox-plans.py.
//         The sandbox buyer's login comes from the macOS Keychain, so it never
//         appears in a transcript or a shell history.
// Output: one PASS/FAIL line per claim, a final SUBID=… PLAN=… line for the
//         verify step to read, and exit 0 only when every claim passed.
// Why a standalone script rather than the browser tool: that tool's snippet
//         context is sandboxed with no Keychain access, so the password would
//         have to be typed inline, which publishes it.
//
// What it actually tests — the three things jsdom cannot answer (the fourth,
// that the subscription is ACTIVE in PayPal, is paypal-sandbox-verify.py):
//   A the click is not refused with an empty email box (wallets P6)
//   B the card "Pay" button is dead, and relabelled, by the time the order
//     finishes (wallets P10) — read from INSIDE the page at the one moment that
//     is guaranteed to be within the lock window, never polled from outside.
//     The ORDER of the lock and the lookup (lockForm() first) is pinned by the
//     jsdom suite, which reads the source; this proves the lock really took
//     effect in a real browser, which the source cannot say.
//   C actions.subscription.get() really returns subscriber.email_address at
//     runtime, and that address is what reaches /welcome (wallets P6)
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');

const PLAN = process.argv[2];
const BASE = process.argv[3];
const PLANS_PATH = process.argv[4];
if (!PLAN || !BASE || !PLANS_PATH) {
  console.error('usage: paypal-sandbox-buy.js <plan> <base-url> <plan-map.json>');
  process.exit(2);
}
const EXPECTED_PLAN_ID = JSON.parse(fs.readFileSync(PLANS_PATH, 'utf8'))[PLAN].plan_id;

let failures = 0;

// Input: whether the claim held, its label, and optionally what was actually seen.
// Output: one line on stdout, and a bump of the failure count. Why count rather
// than throw: every claim should be reported on a bad run, not just the first.
const say = (ok, label, extra) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}${extra !== undefined ? '  (' + extra + ')' : ''}`);
};

// Input: a Keychain account name. Output: its value. Why: keeps the sandbox
// buyer's password out of the command line, where `ps` and the shell history
// would both see it.
const keychain = (account) => execFileSync('security',
  ['find-generic-password', '-s', 'leskobusiness-paypal-sandbox', '-a', account, '-w'],
  { encoding: 'utf8' }).trim();

(async () => {
  const buyerEmail = keychain('email');
  const buyerPassword = keychain('password');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 120));
  });

  console.log(`--- plan under test: ${PLAN} (sandbox plan ${EXPECTED_PLAN_ID}) ---`);
  await page.goto(`${BASE}/checkout?plan=${PLAN}`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);

  // Observe without changing behaviour: wrap finish() to record the subscription
  // id it is handed (wallets K7 puts PayPal's subscription id where a Recurly
  // token id would go), then call straight through. Needed because neither
  // /welcome nor localStorage carries that id, and the id is the only way to ask
  // PayPal afterwards whether the subscription really exists.
  await page.evaluate(() => {
    const real = window.LeskoCheckout.finish;
    window.LeskoCheckout.finish = function (result, tokenId, buyerEmail) {
      // finish() is called at the END of the address lookup and BEFORE the page
      // navigates, so it is the one instant that is certainly inside the lock
      // window. Reading the button here is deterministic; polling from outside
      // was not — on 2026-10-24 a correct page reported "never observed
      // disabled" simply because the lookup had resolved before the first poll.
      const button = document.getElementById('payBtn');
      const label = document.getElementById('payBtnText');
      const lock = {
        disabled: !!(button && button.disabled),
        label: label ? (label.textContent || '').trim() : '',
      };
      // sessionStorage survives the same-origin hop to /welcome; a window
      // property does not.
      try {
        sessionStorage.setItem('__subId', tokenId || '');
        sessionStorage.setItem('__lock', JSON.stringify(lock));
      } catch (e) { /* private mode: the fallbacks below still work */ }
      window.__subId = tokenId;
      window.__lock = lock;
      return real.apply(this, arguments);
    };
  });

  const emailBox = await page.inputValue('#email');
  say(emailBox === '', 'the email box is empty — this is the case under test',
      `value=${JSON.stringify(emailBox)}`);
  say(await page.isDisabled('#payBtn') === false,
      'before approval the card button is live, so check B is not vacuous');

  // ── A: the click must reach PayPal rather than being refused ──────────────────
  const popupPromise = page.waitForEvent('popup', { timeout: 30000 });
  // #wallets holds two iframes — the button and PayPal's own close-detector — so a
  // bare `#wallets iframe` is a strict-mode violation. Take the titled one.
  await page.frameLocator('#wallets iframe[title="PayPal"]')
    .getByRole('link', { name: /paypal/i }).first().click();
  let popup = null;
  try { popup = await popupPromise; } catch (e) { /* no popup opened */ }
  say(!!popup, 'A: the click opened PayPal instead of being refused (P6)');
  const messageAfterClick = await page.textContent('#payMsg');
  say((messageAfterClick || '').trim() === '', 'A: no error was shown on our page',
      JSON.stringify(messageAfterClick));
  if (!popup) { await browser.close(); process.exit(1); }

  // ── log in as the sandbox buyer and approve ───────────────────────────────────
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForTimeout(3000);
  await popup.getByRole('textbox', { name: /email|mobile/i }).first().fill(buyerEmail);
  const next = popup.getByRole('button', { name: /^next$/i }).first();
  if (await next.isVisible().catch(() => false)) {
    await next.click();
    await popup.waitForTimeout(4000);
  }
  const password = popup.locator('input[type="password"]').first();
  await password.waitFor({ state: 'visible', timeout: 25000 });
  await password.fill(buyerPassword);
  await popup.getByRole('button', { name: /log ?in|sign ?in/i }).first().click();
  await popup.waitForTimeout(9000).catch(() => {});

  // PayPal words the approve button differently per flow, so try several, and
  // keep clicking through the review steps until none of them is on screen.
  const approveLabels = [/agree (and|&) subscribe/i, /subscribe now/i, /^subscribe$/i,
                         /agree (and|&) continue/i, /continue to review/i, /^continue$/i,
                         /complete purchase/i];
  for (let round = 0; round < 4 && !popup.isClosed(); round += 1) {
    let clicked = false;
    for (const label of approveLabels) {
      const button = popup.getByRole('button', { name: label }).first();
      if (await button.isVisible().catch(() => false)) {
        console.log(`  (clicking "${(await button.textContent().catch(() => '')).trim().slice(0, 40)}")`);
        await button.click().catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) break;
    // The LAST approve click closes the popup, so waiting on the POPUP here throws
    // "Target page, context or browser has been closed" — which reads as a page
    // failure but is this harness racing PayPal (2026-10-23). Wait on the main
    // page instead; it always outlives the popup.
    await page.waitForTimeout(6000).catch(() => {});
    if (popup.isClosed()) break;
  }

  // ── wait for the hop to /welcome, then read what the page recorded ───────────
  // Nothing is sampled here: the two readings below were taken inside the page,
  // at the moment the order finished. All this loop does is wait.
  let welcomeUrl = null;
  for (let i = 0; i < 200; i += 1) {
    if (page.url().includes('/welcome')) { welcomeUrl = page.url(); break; }
    await page.waitForTimeout(100);
  }

  // window.__lock dies with the checkout page, so sessionStorage is the one that
  // survives; the window property is the fallback for a browser that refuses
  // storage, where the page would still have navigated.
  const recorded = await page.evaluate(() => {
    let stored = null;
    try { stored = sessionStorage.getItem('__lock'); } catch (e) { /* refused */ }
    const lock = stored ? JSON.parse(stored) : (window.__lock || null);
    let subId = null;
    try { subId = sessionStorage.getItem('__subId'); } catch (e) { /* refused */ }
    return { lock, subId: subId || window.__subId || null };
  }).catch(() => ({ lock: null, subId: null }));

  const lock = recorded.lock;
  let subscriptionId = recorded.subId;

  say(!!(lock && lock.disabled),
      'B: the card button was DEAD when the order finished (P10)',
      lock ? `disabled=${lock.disabled}, label was "${lock.label}"`
           : 'finish() was never reached, so nothing was recorded');
  say(!!(lock && /finishing/i.test(lock.label)),
      'B: and it had been relabelled, so the buyer can see why it is dead',
      lock ? `label was "${lock.label}"` : 'nothing recorded');
  say(!!welcomeUrl, 'the buyer reached /welcome',
      welcomeUrl ? welcomeUrl.replace(/email=[^&]*/, 'email=<redacted>') : page.url());

  // ── C: did PayPal's own address reach /welcome? ───────────────────────────────
  if (welcomeUrl) {
    const got = decodeURIComponent(new URL(welcomeUrl).searchParams.get('email') || '');
    const matches = got.toLowerCase() === buyerEmail.toLowerCase();
    say(matches,
        'C: /welcome carries the PAYPAL account address, so subscription.get() worked (P6)',
        got === '' ? 'empty — the lookup fell back to nothing'
                   : (matches ? 'matches the sandbox buyer' : 'DIFFERENT from the sandbox buyer'));
  }

  say(consoleErrors.length === 0, 'no console errors on our page',
      consoleErrors.join(' | ') || 'none');

  say(!!subscriptionId, 'a subscription id reached LeskoCheckout.finish (K7)',
      subscriptionId || 'none recorded');

  console.log(`SUBID=${subscriptionId || ''} PLAN=${PLAN} EXPECT=${EXPECTED_PLAN_ID}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('SCRIPT ERROR:', err.message);
  process.exit(1);
});
