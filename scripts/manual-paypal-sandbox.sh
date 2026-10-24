#!/usr/bin/env bash
# manual-paypal-sandbox.sh [monthly|half-year|yearly|all] — buy a real PayPal
# SANDBOX subscription through this repo's own /checkout page, with the email box
# left empty, and prove what happened.
#
# Input : a plan name, or "all" (the default) for one purchase per plan. Five
#         things must be in place, and each one says so clearly if it is not:
#         the four Keychain items under service leskobusiness-paypal-sandbox
#         (client_id, secret, email, password), and a playwright chromium.
# Output: PASS/FAIL lines per claim per plan, a summary table, and exit 0 only
#         when every claim of every plan passed.
# Why    : this is MANUAL and deliberately not in any automated run. It needs
#         credentials, a network, and PayPal's own hosted UI, which changes
#         under us without warning — a suite that can fail for that reason does
#         not belong in a gate. Run it by hand before shipping a change to
#         assets/wallet-paypal.js. The jsdom suite (scripts/test-wallet-paypal.sh)
#         covers everything that can be proved without PayPal; this covers the
#         four things that cannot:
#           A the click is not refused with an empty email box     (wallets P6)
#           B the card button is dead and relabelled when it finishes (wallets P10)
#           C subscription.get() returns the buyer's address       (wallets P6)
#           D the subscription is ACTIVE, on the right plan, at the right price
#
# It cannot take real money: every call is to api-m.sandbox.paypal.com, and the
# page under test is a patched LOCAL copy. Nothing is written into the repo and
# production is never touched. The live credentials are not reachable from here.
#
# Usage: scripts/manual-paypal-sandbox.sh            # all three plans
#        scripts/manual-paypal-sandbox.sh yearly     # just one
set -euo pipefail

# Pinned, not "latest": playwright-core only drives the chromium build it ships
# for, so an unpinned install can want a browser this Mac has never downloaded
# and fail at launch rather than at install.
PLAYWRIGHT_VERSION="1.64.1"

WANTED="${1:-all}"
case "$WANTED" in
  monthly|half-year|yearly) PLANS=("$WANTED") ;;
  all) PLANS=(monthly half-year yearly) ;;
  *) echo "usage: $(basename "$0") [monthly|half-year|yearly|all]" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TMP="$(mktemp -d)"
SERVER_PID=""

# Input: nothing. Output: nothing; stops the server this script started and
# removes the scratch folder. Why it kills ONE recorded pid and never a pattern:
# a pattern kill is banned on this machine (it once killed every session), and
# docs/specs/modules/worker.md records another suite killing a different
# worktree's server by matching on a port.
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$RUN_TMP"
}
trap cleanup EXIT

echo "== preflight =="
for item in client_id secret email password; do
  if ! security find-generic-password -s leskobusiness-paypal-sandbox -a "$item" -w >/dev/null 2>&1; then
    echo "missing Keychain item '$item'. Create the four of them with:" >&2
    for needed in client_id secret email password; do
      echo "  security add-generic-password -U -s leskobusiness-paypal-sandbox -a $needed -w" >&2
    done
    echo "(client_id/secret come from the sandbox REST app; email/password are the sandbox buyer)" >&2
    exit 2
  fi
done
echo "  four Keychain items present"

npm install --prefix "$RUN_TMP" --no-save --silent "playwright-core@$PLAYWRIGHT_VERSION" \
  >"$RUN_TMP/npm-install.log" 2>&1 \
  || { echo "npm install playwright-core@$PLAYWRIGHT_VERSION failed:" >&2; tail -20 "$RUN_TMP/npm-install.log" >&2; exit 2; }
echo "  playwright-core $PLAYWRIGHT_VERSION installed into the scratch folder"

# node resolves `require` from the SCRIPT's folder upwards, never from the
# working directory, so a script left in scripts/ cannot see a node_modules in
# the scratch folder. scripts/test-ga4-events.sh solves the same thing the same
# way: copy the script next to the modules it needs.
cp "$SCRIPT_DIR/paypal-sandbox-buy.js" "$RUN_TMP/paypal-sandbox-buy.js"

# Launch the browser once, before anything else is set up. A path check would
# pass on a half-downloaded cache; actually launching is the only honest answer,
# and it costs under a second.
if ! (cd "$RUN_TMP" && node -e '
  require("playwright-core").chromium.launch({ headless: true })
    .then(b => b.close())
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
' >"$RUN_TMP/browser-check.log" 2>&1); then
  echo "playwright cannot launch chromium on this Mac:" >&2
  tail -5 "$RUN_TMP/browser-check.log" >&2
  echo "Download it once with:  npx playwright@$PLAYWRIGHT_VERSION install chromium" >&2
  exit 2
fi
echo "  chromium launches"

# Ask the OS for a free port rather than hard-coding one. docs/specs/modules/
# worker.md:42 records what a hard-coded 8799 did when two worktrees ran at once.
PORT="$(python3 -c '
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
')"
BASE="http://127.0.0.1:$PORT"

echo
echo "== sandbox plans =="
python3 "$SCRIPT_DIR/paypal-sandbox-plans.py" "$RUN_TMP/plans.json"

echo
echo "== local server on port $PORT =="
CLIENT_ID="$(security find-generic-password -s leskobusiness-paypal-sandbox -a client_id -w)"
python3 "$SCRIPT_DIR/paypal-sandbox-serve.py" \
  --client-id "$CLIENT_ID" --plans "$RUN_TMP/plans.json" \
  --site "$RUN_TMP/site" --port "$PORT" >"$RUN_TMP/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null "$BASE/checkout?plan=monthly" 2>/dev/null; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "the local server exited before answering:" >&2
    cat "$RUN_TMP/server.log" >&2
    exit 1
  fi
  sleep 0.25
done
curl -fsS -o /dev/null "$BASE/checkout?plan=monthly" || { echo "server never answered on $BASE" >&2; exit 1; }
head -1 "$RUN_TMP/server.log"
echo "  serving $BASE"

summary=()
worst=0
for plan in "${PLANS[@]}"; do
  echo
  echo "== $plan =="
  buy_log="$RUN_TMP/buy-$plan.log"
  if (cd "$RUN_TMP" && node "$RUN_TMP/paypal-sandbox-buy.js" "$plan" "$BASE" "$RUN_TMP/plans.json") \
       2>&1 | tee "$buy_log"; then
    buy_ok=1
  else
    buy_ok=0
    worst=1
  fi

  sub_id="$(sed -n 's/^SUBID=\([^ ]*\) .*/\1/p' "$buy_log" | tail -1)"
  if [[ -z "$sub_id" ]]; then
    echo "FAIL - D: no subscription id was recorded, so PayPal cannot be asked about it"
    summary+=("$plan|(none)|browser checks $([[ $buy_ok == 1 ]] && echo passed || echo FAILED), nothing to verify")
    worst=1
    continue
  fi

  if python3 "$SCRIPT_DIR/paypal-sandbox-verify.py" "$sub_id" "$plan" "$RUN_TMP/plans.json"; then
    verify_ok=1
  else
    verify_ok=0
    worst=1
  fi
  if [[ $buy_ok == 1 && $verify_ok == 1 ]]; then
    summary+=("$plan|$sub_id|all claims passed")
  else
    summary+=("$plan|$sub_id|FAILED ($([[ $buy_ok == 1 ]] && echo 'browser ok' || echo 'browser FAILED'), $([[ $verify_ok == 1 ]] && echo 'paypal ok' || echo 'paypal FAILED'))")
  fi
done

echo
echo "== summary =="
printf '%-10s  %-20s  %s\n' "plan" "subscription" "result"
for row in "${summary[@]}"; do
  IFS='|' read -r plan sub result <<<"$row"
  printf '%-10s  %-20s  %s\n' "$plan" "$sub" "$result"
done

echo
if [[ $worst == 0 ]]; then
  echo "ALL PASS - every claim held for: ${PLANS[*]}"
else
  echo "FAILED - at least one claim did not hold; read the lines above"
fi
exit "$worst"
