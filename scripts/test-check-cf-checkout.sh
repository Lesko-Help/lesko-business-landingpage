#!/usr/bin/env bash
# Test for scripts/check-cf-checkout.sh (page spec B7: the checker follows redirects).
#
# Input:  optionally the path of the checker to test (default scripts/check-cf-checkout.sh), so a
#         scratch copy with a deliberate bug can be pointed at to make this test go red.
# Output: one PASS/FAIL line per scenario and exit 0 only if every scenario behaved.
# Why:    the checker only ever runs by hand against the live host, so without a stand-in server
#         nobody sees it break. The stand-in (a tiny python server on 127.0.0.1) plays
#         ClickFunnels: the short path answers 302 to a slug page, as the live host does. Each
#         scenario lives under its own path prefix, which is passed as CF_CHECKOUT_BASE.
#
# Usage: scripts/test-check-cf-checkout.sh [checker.sh]
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CHECKER="${1:-$SCRIPT_DIR/check-cf-checkout.sh}"
WORK_DIR="$(mktemp -d)"
SERVER_PID=""
trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; rm -rf "$WORK_DIR"' EXIT

# The PayPal ids a good page must carry are read from the same file the checker reads them from.
WALLET_FILE="$REPO_DIR/assets/wallet-paypal.js"
export PAYPAL_CLIENT_ID="$(sed -n "s/.*PAYPAL_CLIENT_ID = '\([^']*\)'.*/\1/p" "$WALLET_FILE")"
export PAYPAL_PLAN_IDS="$(grep -o "P-[0-9A-Z]\{24\}" "$WALLET_FILE" | sort -u | tr '\n' ' ')"

# The stand-in server. Input: the port file path as argv[1]. Output: serves until killed.
# Scenarios, by path prefix (the part before the plan name):
#   /ok/       short path 302 to a slug page that is right                      -> live
#   /abs/      same, but the Location header is an absolute URL on this host    -> live
#   /two/      short path 302 to a second 302 to the right page (2 hops)        -> live
#   /three/    three 302s in a row, then the right page (3 hops, the limit)     -> live
#   /four/     four 302s in a row (one over the limit)                          -> dead
#   /loop/     a 302 that points at itself                                      -> dead
#   /away/     302 to another host                                              -> dead
#   /wrongid/  302 to a page with the wrong page id                             -> dead
#   /plain/    the short path itself is the right page, no redirect             -> live
#   /bare/     302 to a page that is a 404                                      -> dead
#   /busy/     302 to a page that answers 429                                   -> unknown
#   /protorel/ 302 whose Location is protocol-relative (//host/path), another host -> dead
#   /noloc/    a 302 that carries no Location header at all                     -> dead
#   /busyfirst/ the short path itself answers 429, no redirect yet              -> unknown
#   /midfail/  a 302, then a second hop that answers 503                        -> unknown
#   /twoloc/   a 302 with two Location headers; only the first (the good one) counts -> live
cat > "$WORK_DIR/standin.py" <<'PYTHON'
import http.server, os, sys

PAGE_IDS = {"monthly": "64133517", "half-year": "64133609", "yearly": "64133610"}
PRICES = {"monthly": "29.95", "half-year": "89.95", "yearly": "149.95"}
SLUGS = {"monthly": "monthly64133517", "half-year": "business_half-year", "yearly": "business_yearly"}

def good_page(plan, page_id=None):
    """Input: a plan name, and optionally a wrong page id to plant.
    Output: the bytes of an order page that carries everything the checker asserts on (page id,
    plan code, price, our PayPal client id and exactly our three PayPal plan ids).
    Why: one place builds the "right page", so a scenario can break exactly one thing in it."""
    plan_ids = " ".join('"%s"' % pid for pid in os.environ["PAYPAL_PLAN_IDS"].split())
    return (
        '<input type="hidden" value="%s">'
        '<input data-product-payment-gateway-plan-id="business-cf-%s" data-product-amount="%s">'
        '<script>var client="%s"; var plans=[%s];</script>'
        % (page_id or PAGE_IDS[plan], plan, PRICES[plan], os.environ["PAYPAL_CLIENT_ID"], plan_ids)
    ).encode()

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        """Input: the server's log arguments. Output: nothing. Why: keeps the test output to
        the PASS/FAIL lines instead of one access-log line per request."""

    def reply(self, status, body=b"", location=None, extra_location=None):
        """Input: a status code, a body, and optionally a Location header (plus a second one).
        Output: writes the whole HTTP answer to the client. Why: every scenario answers through
        here, so a header is sent the same way each time."""
        self.send_response(status)
        if location:
            self.send_header("Location", location)
        if extra_location:
            self.send_header("Location", extra_location)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Input: a GET request whose first path part names the scenario and whose last part is
        a plan name, a hop (hop1monthly) or a page slug. Output: the answer that scenario gives
        (a redirect, a page, an error). Why: this is the pretend ClickFunnels the checker is run
        against; each scenario at the top of this file is one branch below."""
        parts = self.path.strip("/").split("/")
        scenario, name = parts[0], parts[-1]
        plan = next((p for p in PAGE_IDS if name == p or name.startswith("hop") and name.endswith(p)
                     or name == SLUGS[p]), None)
        if plan is None:
            return self.reply(404, b"nope")
        slug = "/%s/%s" % (scenario, SLUGS[plan])
        host = "http://%s" % self.headers["Host"]
        short = (name == plan)

        if scenario == "ok":
            return self.reply(302, location=slug) if short else self.reply(200, good_page(plan))
        if scenario == "abs":
            return self.reply(302, location=host + slug) if short else self.reply(200, good_page(plan))
        if scenario == "plain":
            return self.reply(200, good_page(plan))
        if scenario in ("two", "three", "four"):
            chain = {"two": 2, "three": 3, "four": 4}[scenario]
            if short:
                return self.reply(302, location="/%s/hop1%s" % (scenario, plan))
            if name.startswith("hop"):
                n = int(name[3])
                if n < chain - 1:
                    return self.reply(302, location="/%s/hop%d%s" % (scenario, n + 1, plan))
                return self.reply(302, location=slug)
            return self.reply(200, good_page(plan))
        if scenario == "loop":
            return self.reply(302, location="/loop/" + name)
        if scenario == "away":
            return self.reply(302, location="http://example.invalid/%s" % plan)
        if scenario == "wrongid":
            return self.reply(302, location=slug) if short else self.reply(200, good_page(plan, "1"))
        if scenario == "bare":
            return self.reply(302, location="/bare/gone") if short else self.reply(404, b"gone")
        if scenario == "protorel":
            return self.reply(302, location="//example.invalid/%s" % plan)
        if scenario == "noloc":
            return self.reply(302)
        if scenario == "busyfirst":
            return self.reply(429, b"slow down")
        if scenario == "midfail":
            if short:
                return self.reply(302, location="/midfail/hop1%s" % plan)
            return self.reply(503, b"down")
        if scenario == "twoloc":
            return (self.reply(302, location=slug, extra_location="http://example.invalid/x")
                    if short else self.reply(200, good_page(plan)))
        if scenario == "busy":
            return self.reply(302, location=slug) if short else self.reply(429, b"slow down")
        return self.reply(404, b"nope")

server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
open(sys.argv[1], "w").write(str(server.server_port))
server.serve_forever()
PYTHON

python3 -I "$WORK_DIR/standin.py" "$WORK_DIR/port" &
SERVER_PID=$!
for _ in $(seq 1 50); do [ -s "$WORK_DIR/port" ] && break; sleep 0.1; done
PORT="$(cat "$WORK_DIR/port" 2>/dev/null)"
if [ -z "$PORT" ]; then echo "FAIL: the stand-in server did not start"; exit 1; fi

failures=0

# Input: a scenario name, the expected exit code, and text that must appear in the output
# (a verdict word). Output: one PASS/FAIL line. Why: every scenario is judged the same way.
run_scenario() {
  local scenario="$1" want_exit="$2" want_text="$3" output code
  # NO_PROXY: a proxy set in the shell must not swallow the calls to 127.0.0.1.
  output="$(NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 CF_CHECKOUT_BASE="http://127.0.0.1:$PORT/$scenario" CF_PACE_SECONDS=0 bash "$CHECKER" 2>&1)"
  code=$?
  if [ "$code" = "$want_exit" ] && grep -qF -- "$want_text" <<<"$output"; then
    echo "PASS $scenario: exit $code, output has '$want_text'"
  else
    echo "FAIL $scenario: wanted exit $want_exit and '$want_text', got exit $code:"
    sed 's/^/    /' <<<"$output"
    failures=$((failures + 1))
  fi
}

run_scenario ok      0 "ALL LIVE"
run_scenario abs     0 "ALL LIVE"
run_scenario two     0 "ALL LIVE"
run_scenario three   0 "ALL LIVE"
run_scenario plain   0 "ALL LIVE"
run_scenario four    1 "monthly dead: more than 3 redirects"
run_scenario loop    1 "monthly dead: more than 3 redirects"
run_scenario away    1 "monthly dead: redirected to another host"
run_scenario wrongid 1 "monthly dead: page id 64133517 not found"
run_scenario bare    1 "monthly dead: HTTP 404"
run_scenario busy    1 "monthly unknown: HTTP 429"
run_scenario protorel  1 "monthly dead: redirected to another host"
run_scenario noloc     1 "monthly dead: HTTP 302 without a Location header"
run_scenario busyfirst 1 "monthly unknown: HTTP 429"
run_scenario midfail   1 "monthly unknown: HTTP 503"
run_scenario twoloc    0 "ALL LIVE"

# The live line names the page the buyer really lands on, so a reader can see the redirect was followed.
live_output="$(NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 CF_CHECKOUT_BASE="http://127.0.0.1:$PORT/ok" CF_PACE_SECONDS=0 bash "$CHECKER" 2>&1)"
if grep -qF "1 redirect" <<<"$live_output" && grep -qF "monthly64133517" <<<"$live_output"; then
  echo "PASS ok: the live line names the final page and the redirect count"
else
  echo "FAIL ok: the live line should name '1 redirect' and the final slug:"; sed 's/^/    /' <<<"$live_output"
  failures=$((failures + 1))
fi

if [ "$failures" -eq 0 ]; then echo "ALL PASSED"; exit 0; fi
echo "$failures scenario(s) FAILED"; exit 1
