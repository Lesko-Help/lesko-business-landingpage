// LeskoHelp Pro — tiny API worker.
// Static assets are served before this worker runs; only unmatched
// routes (like /api/videos) land here.

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

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function clean(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

async function subscribe(request, env) {
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

  const billing = { token_id: token };
  if (tds) billing.three_d_secure_action_result_token_id = tds;
  const account = { code: email, email, first_name: first, last_name: last, billing_info: billing };
  if (company) account.company = company;
  const purchase = { currency: 'USD', account, subscriptions: [{ plan_code: plan }] };

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
    console.log('subscribe declined', plan, te.code || '', te.message || err.message || '');
    return json({ ok: false, error: 'declined', message: te.message || 'Your card was declined. Please try another card or contact your bank.' }, 402);
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

    if (url.pathname === '/api/subscribe') return subscribe(request, env);

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
