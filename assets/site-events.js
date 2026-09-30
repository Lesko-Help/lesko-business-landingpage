// ──────────── Shared GA4 analytics — used by index.html, checkout.html and welcome.html ────────────
// One measurement id, one consent rule and one plan-price table for the whole site, so any of the
// three only has to be changed here. Everything stays off until GA4_MEASUREMENT_ID is filled in.
window.LeskoAnalytics = (function () {
  // The id of the GA4 data stream, like 'G-XXXXXXXXXX'. Empty = analytics off: no script is loaded,
  // no cookie is set, nothing is queued or sent from any page. Filled in 2026-09-30 (DECISION BY
  // MARTIN): 'G-6K847LXFE7' is the leskobusiness.com web stream on the GA4 property he created that
  // day, enhanced measurement on except Form interactions.
  var GA4_MEASUREMENT_ID = 'G-6K847LXFE7';

  // Plan code (the ?plan= value used everywhere on the site: the checkout links, checkout.html and
  // welcome.html) -> what that plan costs. Must match the pricing cards in index.html and
  // checkout.html, and the plans in Recurly. A leading "business-" (an older or Recurly-shaped plan
  // code) is stripped before the lookup, so a link from either naming still prices correctly.
  var PLAN_PRICES_USD = {
    'monthly': 29.95,
    'half-year': 89.95,
    'yearly': 149.95
  };

  // Countries where a visitor must agree before analytics cookies are set. The site has no consent
  // banner, so a visitor here gets an anonymous, cookieless signal instead of being asked.
  var CONSENT_REQUIRED_REGIONS = [
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
    'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
    'SE', 'IS', 'LI', 'NO', 'GB', 'CH'
  ];

  var started = false;

  // Input: an optional object of extra GA4 config params for the calling page (e.g. { plan: 'yearly' }
  // on checkout.html so its automatic page_view carries the plan, or { page_location: '...' } on
  // welcome.html so the email query parameter never reaches Google). Output: true once gtag.js is
  // queued and configured; false while GA4_MEASUREMENT_ID is empty. Why: this is the only place
  // allowed to load the external Google script, so a page that never calls it, or an empty id, sends
  // nothing anywhere — the guarantee the whole feature rests on.
  function init(extraConfig) {
    if (!GA4_MEASUREMENT_ID) return false;
    if (started) return true;
    started = true;

    window.dataLayer = window.dataLayer || [];
    // Input: any gtag command. Output: none; it queues the command for Google's script. Must pass
    // `arguments` itself unchanged, that is the format Google's loader reads back out.
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    var everythingDenied = {
      ad_storage: 'denied', ad_user_data: 'denied',
      ad_personalization: 'denied', analytics_storage: 'denied'
    };
    var analyticsOnly = {
      ad_storage: 'denied', ad_user_data: 'denied',
      ad_personalization: 'denied', analytics_storage: 'granted'
    };
    gtag('consent', 'default', analyticsOnly);
    everythingDenied.region = CONSENT_REQUIRED_REGIONS;
    gtag('consent', 'default', everythingDenied);

    gtag('js', new Date());
    gtag('config', GA4_MEASUREMENT_ID, extraConfig || {});

    var googleScript = document.createElement('script');
    googleScript.async = true;
    googleScript.src = 'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(GA4_MEASUREMENT_ID);
    document.head.appendChild(googleScript);

    return true;
  }

  // Input: a GA4 event name and its params object. Output: none; queues the event, or does nothing at
  // all when analytics is off (empty id) or a page calls this before init(). Why: every page's own
  // click/submit handlers call this instead of touching window.gtag directly, so "off means nothing is
  // sent" only has to be guaranteed in this one file.
  function track(name, params) {
    if (!GA4_MEASUREMENT_ID || typeof window.gtag !== 'function') return;
    window.gtag('event', name, params || {});
  }

  // Input: a plan code, in either shape ('yearly' or 'business-yearly'). Output: its USD price, or
  // undefined if it is not one of ours. Why: index.html, checkout.html and welcome.html each need the
  // price for the events below, and it must be the same number everywhere.
  function planPriceUSD(planCode) {
    return PLAN_PRICES_USD[String(planCode || '').replace(/^business-/, '')];
  }

  return {
    init: init,
    track: track,
    isOn: function () { return !!GA4_MEASUREMENT_ID; },
    planPriceUSD: planPriceUSD
  };
})();
