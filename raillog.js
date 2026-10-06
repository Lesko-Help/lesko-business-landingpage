// raillog.js — the one-line failure alert this Worker prints, ported from
// lesko-provisioning's worker/raillog.py (CLAUDE.md "Unattended code
// reports its own failure", decided 2026-09-14). That Python version also
// writes a BigQuery row for every external call this repo makes; this
// Worker writes nothing of its own (docs/specs/modules/worker.md: "Writes:
// ... nothing of its own"), so only the single-line alert() half of that
// pattern crosses over — there is no table to insert into here.
//
// Cloudflare Workers has no GCP-style auto severity detection the way
// Cloud Run does (every other repo's raillog.py relies on Cloud Logging
// promoting a `"severity":"ERROR"` JSON field): the JSON `severity` key
// below is kept anyway, for text-shape parity with every other repo's
// BTB_ALERT line, but console.error() (not console.log()) is what
// Cloudflare's own Workers Logs level filter actually reads.

const REPO = 'lesko-business-landingpage';

// The seven codes the repo-wide alerting convention fixes in the global
// CLAUDE.md, plus one this repo adds. PAYMENT_DECLINED: a card decline is
// the single most anticipated failure a payment API can report — on
// 2026-10-06 it was 100% of real purchase attempts — so folding it into
// UNEXPECTED would leave UNEXPECTED matching the common case instead of
// an actual bug, which is the opposite of what grouping by code is for
// (justified in docs/briefs/subscribe-ip-logging.md's Context).
export const ALERT_CODES = new Set([
  'AUTH_FAILED', 'SOURCE_FAILED', 'SOURCE_EMPTY',
  'ASSERTION_FAILED', 'QUOTA', 'STALE', 'UNEXPECTED',
  'PAYMENT_DECLINED'
]);

// Prints the one line a Cloud Monitoring (or equivalent) log-based alert
// matches on. Input: `runnable` (which route/thing failed, e.g.
// "api-subscribe"), `code` (one of ALERT_CODES), `what` (a short detail —
// never card data, the buyer's email, or buyer-facing message text).
// Output: nothing — prints the line and returns. Why it throws on a code
// outside ALERT_CODES: a typo here is a bug in the caller, and must fail
// loudly in testing rather than silently print a line no alert policy will
// ever match in production.
export function alert(runnable, code, what) {
  if (!ALERT_CODES.has(code)) {
    throw new Error('alert() code ' + JSON.stringify(code) + ' is not one of ' + [...ALERT_CODES].sort().join(', '));
  }
  const message = 'BTB_ALERT ' + REPO + '/' + runnable + ' ' + code + ': ' + what;
  console.error(JSON.stringify({ severity: 'ERROR', message }));
}
