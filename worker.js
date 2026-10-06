// LeskoHelp Pro — tiny API worker.
// Static assets are served before this worker runs; only unmatched
// routes (like /api/videos) land here.

import { alert } from './raillog.js';
import { EmailMessage } from 'cloudflare:email';

const CHANNEL_ID = 'UCwKJZfa7sWV_qKxQnLBUpjA'; // @MatthewLesko
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID;
const MAX_VIDEOS = 12;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function latestVideos() {
  const res = await fetch(FEED_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; LeskoHelpSite/1.0)' },
    cf: { cacheTtl: 1800, cacheEverything: true }
  });
  if (!res.ok) throw new Error('feed ' + res.status);
  const xml = await res.text();
  const videos = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = entryRe.exec(xml)) && videos.length < MAX_VIDEOS) {
    const entry = m[1];
    const id = (entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/) || [])[1];
    const title = (entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const published = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
    if (id && title) videos.push({ id, title: decodeEntities(title.trim()), published: published || null });
  }
  return videos;
}

// ── /api/subscribe: create the Recurly subscription for the checkout page ──
// The page collects a one-time card token with Recurly.js (card data never
// reaches us). This route turns that token + the buyer's details into a
// purchase on the chosen business plan, using the Recurly private API key
// stored as the Worker secret RECURLY_API_KEY (set by Martin in Cloudflare).
const RECURLY_API = 'https://v3.recurly.com';
const PLAN_CODES = {
  'monthly':   'business-monthly',
  'half-year': 'business-half-year',
  'yearly':    'business-yearly'
};
const SUPPORT = 'support@lesko.help';

// Where a decline's email alert comes from and goes to. FROM is any
// address on leskobusiness.com (the send_email binding only requires the
// zone itself to have Email Routing on — it needs no inbox of its own,
// since nothing replies to it). TO is Martin's own address; Cloudflare's
// send_email binding refuses to mail an address that is not either on one
// of our own routed zones or added and verified as a destination address
// first (`wrangler email routing addresses create`) — a one-time account
// step, done once, not by this Worker.
const DECLINE_ALERT_FROM = 'alerts@leskobusiness.com';
const DECLINE_ALERT_TO = 'martin.j.menke@gmail.com';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

// Cloudflare sets this header itself from the actual TCP connection, so it
// cannot be spoofed by the client the way an X-Forwarded-For could be.
// Input: the incoming request. Output: the caller's IP as a string, or ''
// if Cloudflare did not supply one (should not happen in production, but
// an empty string — not a fake IP — is the honest answer if it does).
function callerIp(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}

// Card-testing guard: a script trying many stolen card numbers fast looks
// like a burst of POSTs from one place, so we key on the caller's IP (not
// email — an attacker picks a new email every request, so it gates nothing).
// Checked before the method, the key or Recurly, so a blocked caller never
// reaches any of those. Input: the caller's IP (from callerIp(), 'unknown'
// if Cloudflare gave none — a shared bucket for all such callers, so they
// still gate each other) and the SUBSCRIBE_LIMIT binding from
// wrangler.jsonc. Output: true if this call is allowed to continue.
async function withinSubscribeLimit(ip, env) {
  const { success } = await env.SUBSCRIBE_LIMIT.limit({ key: ip || 'unknown' });
  return success;
}

// Builds the exact object POSTed to Recurly's /purchases. Input: the
// caller's IP (from callerIp(), '' if none, currently unused — see below)
// plus the validated form fields. Output: the purchase payload.
// billing_info never carries ip_address here: Recurly's v3 /purchases
// rejects ip_address alongside token_id outright (422 "ip_address cannot
// be present with token_id") because a Recurly.js token already carries
// its own billing info, so no sibling billing_info field may ride with
// it — found 2026-10-06 when this broke every live purchase (commit
// 265f225 had added the line on the mistaken belief Recurly needed it
// passed separately). Its own function so
// scripts/test-subscribe-build-purchase.js can prove this without a live
// Recurly call.
function buildPurchase(ip, plan, token, email, first, last, company, tds) {
  const billing = { token_id: token };
  if (tds) billing.three_d_secure_action_result_token_id = tds;
  const account = { code: email, email, first_name: first, last_name: last, billing_info: billing };
  if (company) account.company = company;
  return { currency: 'USD', account, subscriptions: [{ plan_code: plan }] };
}

// Alerts on every card decline, so Recurly's own answer becomes visible
// here instead of only as a screenshot (CLAUDE.md "Unattended code reports
// its own failure"). Input: the plan code and Recurly's transaction_error
// object (code, gateway_error_code — never te.message, which is the
// buyer-facing text, and never any card or email data). Output: nothing —
// prints one BTB_ALERT line through raillog.js's alert() and returns. Its
// own function so scripts/test-subscribe-decline-alert.js can call it
// directly, the same way scripts/test-decline-reasons.js already calls
// declineMessage() directly, without needing a live Recurly decline.
function logDecline(plan, te) {
  alert('api-subscribe', 'PAYMENT_DECLINED',
    'plan=' + plan + ' code=' + (te.code || '') + ' gateway_error_code=' + (te.gateway_error_code || ''));
}

// Mails Martin directly on every card decline, so the BTB_ALERT line
// logDecline() already writes does not depend on him (or anyone) watching
// Workers Logs to ever be seen — the thing this task exists to fix.
// Input: env (for the SEND_EMAIL binding configured in wrangler.jsonc),
// the plan code, and Recurly's transaction_error object — carrying only
// plan, code and gateway_error_code into the email, same rule as
// logDecline(): never te.message (the buyer-facing text), never the
// buyer's email or card. Output: nothing; sends one email and returns.
// The raw MIME message is built by hand, not with a library — this repo
// has no package.json, and the brief for this task says prefer
// Cloudflare's own binding over a new dependency, so there is deliberately
// nothing here to npm install. If SEND_EMAIL is not bound yet (the account
// step in the comment above DECLINE_ALERT_FROM/TO not done yet), this is a
// no-op: the BTB_ALERT log line is still written by logDecline() either
// way, so a decline is never silently unobserved.
async function sendDeclineAlertEmail(env, plan, te) {
  if (!env.SEND_EMAIL) return;
  const body = 'plan=' + plan + ' code=' + (te.code || '') + ' gateway_error_code=' + (te.gateway_error_code || '');
  const raw =
    'From: ' + DECLINE_ALERT_FROM + '\r\n' +
    'To: ' + DECLINE_ALERT_TO + '\r\n' +
    'Subject: BTB-ALERT lesko-business-landingpage\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'MIME-Version: 1.0\r\n' +
    '\r\n' +
    body + '\r\n';
  const message = new EmailMessage(DECLINE_ALERT_FROM, DECLINE_ALERT_TO, raw);
  await env.SEND_EMAIL.send(message);
}

// Buyer-facing text for the Recurly `transaction_error.code` values worth
// naming individually, grouped by what the shopper actually did (and can
// fix). A code not listed here falls through to Recurly's own `message`,
// then to a generic line — see declineMessage() below. Source: Recurly's
// transaction-error table, API v2021-02-25 (docs.recurly.com/recurly-
// subscriptions/docs/api-transaction-errors, checked 2026-09-30).
const DECLINE_MESSAGES = {
  // Not enough money in the account right now.
  insufficient_funds: 'Your card was declined for insufficient funds. Please try a different card or contact your bank.',
  partial_approval: 'Your card was declined for insufficient funds. Please try a different card or contact your bank.',

  // The card itself has expired, or the expiration date typed does not match it.
  expired_card: 'Your card has expired. Please use a different card.',
  declined_expiration_date: 'The expiration date does not match your card. Please check it and try again.',

  // The CVV security code did not match.
  declined_security_code: 'The security code (CVV) does not match your card. Please check it and try again.',
  fraud_security_code: 'The security code (CVV) does not match your card. Please check it and try again.',

  // The billing address or ZIP does not match what the bank has on file (AVS).
  fraud_address: 'The billing address or ZIP code does not match your card. Please check it and try again.',
  fraud_address_recurly: 'The billing address or ZIP code does not match your card. Please check it and try again.',
  roku_zip_code_mismatch: 'The billing address or ZIP code does not match your card. Please check it and try again.',

  // The card number itself is not valid.
  declined_card_number: 'That card number is not valid. Please check it and try again.',
  invalid_card_number: 'That card number is not valid. Please check it and try again.',
  invalid_account_number: 'That card number is not valid. Please check it and try again.',
  roku_invalid_card_number: 'That card number is not valid. Please check it and try again.',

  // The card's network or type is not one we can accept.
  card_type_not_accepted: 'That card type is not accepted here. Please try a different card.',
  payment_not_accepted: 'That card type is not accepted here. Please try a different card.',
  invalid_issuer: 'That card is not accepted here. Please try a different card.',

  // The bank itself is asking for a phone call before it allows the charge.
  call_issuer: 'Your bank wants you to call them before this card can be used here. Please contact your bank, or try a different card.',
  call_issuer_update_cardholder_data: 'Your bank wants you to call them before this card can be used here. Please contact your bank, or try a different card.',
  restricted_card: 'Your bank has restricted this card. Please contact your bank, or try a different card.',
  restricted_card_chargeback: 'Your bank has restricted this card. Please contact your bank, or try a different card.',
  card_not_activated: 'This card has not been activated yet. Please contact your bank, or try a different card.',

  // The payment system itself is briefly down — nothing the buyer did wrong.
  gateway_unavailable: 'The payment system is temporarily unavailable. Please try again in a minute.',
  processor_unavailable: 'The payment system is temporarily unavailable. Please try again in a minute.',
  processor_not_available: 'The payment system is temporarily unavailable. Please try again in a minute.',
  gateway_timeout: 'The payment system is temporarily unavailable. Please try again in a minute.',
  gateway_error: 'The payment system is temporarily unavailable. Please try again in a minute.',
  too_busy: 'The payment system is temporarily unavailable. Please try again in a minute.',

  // The exact same charge was already submitted moments ago.
  duplicate_transaction: 'This looks like the same charge was just submitted. Please wait a few minutes and try again.'
};

// Any fraud_* code not named above: never say WHY the fraud check fired —
// that would help a card-testing script tune around it — only ever one of
// these two buyer-actionable hints (DECISION IN BRIEF 2026-09-30).
const FRAUD_FALLBACK = 'Your card was declined. Please check your billing address and ZIP code, or try a different card.';

// Turns Recurly's `transaction_error` for a declined card into a message
// the buyer can act on, without leaking gateway or fraud-rule jargon.
// Input: the `transaction_error` object from Recurly's purchase response
// (fields `code`, `category`, `message`, `merchant_advice`,
// `gateway_error_code` — any may be missing). Output: a plain-language
// string safe to show the buyer. Why: Recurly's own `message` is written
// for a merchant's general UI, and an unlisted fraud code must never say
// more than "check your billing address/ZIP" or "try another card".
function declineMessage(te) {
  te = te || {};
  if (te.code && DECLINE_MESSAGES[te.code]) return DECLINE_MESSAGES[te.code];
  if (te.code && /^fraud_/.test(te.code)) return FRAUD_FALLBACK;
  if (te.message) return te.message;
  return 'Your card was declined. Please try another card or contact your bank.';
}

async function subscribe(request, env, ctx) {
  const ip = callerIp(request);
  if (!(await withinSubscribeLimit(ip, env))) {
    return json({ ok: false, error: 'rate-limited', message: 'Too many attempts. Please wait a minute and try again, or email ' + SUPPORT + '.' }, 429);
  }
  if (request.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405);
  if (!env.RECURLY_API_KEY) {
    return json({ ok: false, error: 'not-configured', message: 'Payments are not switched on yet. Please try again later or email ' + SUPPORT + '.' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, message: 'Bad request' }, 400); }

  const plan = PLAN_CODES[clean(body.plan, 20)];
  const token = clean(body.token, 100);
  const email = clean(body.email, 120).toLowerCase();
  const first = clean(body.first_name, 60);
  const last = clean(body.last_name, 60);
  const company = clean(body.company, 120);
  const tds = clean(body.three_d_secure_action_result_token_id, 100);
  if (!plan) return json({ ok: false, message: 'Unknown plan. Please go back to the website and choose a plan again.' }, 400);
  if (!token) return json({ ok: false, message: 'The card check did not complete. Please try again.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, message: 'Please enter a valid email address.' }, 400);
  if (!first || !last) return json({ ok: false, message: 'Please enter your first and last name.' }, 400);

  const purchase = buildPurchase(ip, plan, token, email, first, last, company, tds);

  let res, data;
  try {
    res = await fetch(RECURLY_API + '/purchases', {
      method: 'POST',
      headers: {
        'authorization': 'Basic ' + btoa(env.RECURLY_API_KEY + ':'),
        'accept': 'application/vnd.recurly.v2021-02-25+json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(purchase)
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    return json({ ok: false, message: 'We could not reach the payment company. Please try again in a minute.' }, 502);
  }

  if (res.ok) {
    return json({ ok: true, plan_code: plan, account_code: email }, 201);
  }

  const err = data.error || {};
  // Bank wants a 3-D Secure check: hand the action token back to the page.
  if (err.three_d_secure_action_token_id) {
    return json({ ok: false, three_d_secure_action_token_id: err.three_d_secure_action_token_id, message: 'Your bank wants to check this payment.' }, 402);
  }
  if (err.type === 'transaction' || err.transaction_error) {
    const te = err.transaction_error || {};
    // Alerts on the two ids, for support/debugging — never the buyer-facing
    // message text, and never any card or email data. The email runs
    // through ctx.waitUntil so a slow or failing send never delays or
    // breaks the buyer's own 402 response below; the BTB_ALERT line above
    // already happened regardless of whether the email goes through.
    logDecline(plan, te);
    if (ctx) ctx.waitUntil(sendDeclineAlertEmail(env, plan, te).catch((e) => console.log('decline alert email failed', e.message)));
    return json({ ok: false, error: 'declined', message: declineMessage(te) }, 402);
  }
  if (err.type === 'validation' || err.type === 'invalid_api_version' || res.status === 422) {
    const detail = Array.isArray(err.params) && err.params.length ? err.params.map(p => (p.param ? p.param + ' ' : '') + p.message).join('; ') : (err.message || '');
    console.log('subscribe validation', plan, detail);
    const already = /already/i.test(detail) ? 'This email already has an active membership. Sign in instead, or email ' + SUPPORT + '.' : null;
    return json({ ok: false, error: 'validation', message: already || ('Something in the form was not accepted: ' + detail) }, 400);
  }
  console.log('subscribe failed', res.status, err.type || '', err.message || '');
  return json({ ok: false, message: 'The payment did not go through. Please try again or email ' + SUPPORT + '.' }, 502);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/subscribe') return subscribe(request, env, ctx);

    // The checkout page asks for the site's Recurly PUBLIC key here, so no key
    // is stored in the repo. Set RECURLY_PUBLIC_KEY as a Worker variable.
    if (url.pathname === '/api/config') {
      return json({ recurly_public_key: env.RECURLY_PUBLIC_KEY || null }, 200);
    }

    if (url.pathname === '/api/videos') {
      const cache = caches.default;
      const cacheKey = new Request(url.origin + '/api/videos');
      const cached = await cache.match(cacheKey);
      if (cached) return cached;

      let body, status;
      try {
        body = JSON.stringify({ videos: await latestVideos() });
        status = 200;
      } catch (e) {
        body = JSON.stringify({ videos: [], error: 'feed-unavailable' });
        status = 502;
      }
      const res = new Response(body, {
        status,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': status === 200 ? 'public, max-age=1800' : 'no-store'
        }
      });
      if (status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
      return res;
    }

    return new Response('Not found', { status: 404 });
  }
};
