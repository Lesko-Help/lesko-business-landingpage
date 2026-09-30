#!/usr/bin/env bash
# Proves the /api/subscribe rate limit: input is a directory containing
# worker.js + wrangler.jsonc (either this repo, or a scratch copy of some
# other commit); output is six HTTP status codes from six quick POSTs to
# /api/subscribe on a local `wrangler dev`, plus a PASS/FAIL line. Exists so
# the guard's red state (no rate limiter: never 429) and green state (limiter
# in place: the 6th call is 429) are each provable from a fresh shell, not
# just asserted in prose.
#
# Usage: scripts/test-subscribe-rate-limit.sh <dir-to-serve> <expect-429|expect-no-429>
set -euo pipefail

DIR="${1:?usage: test-subscribe-rate-limit.sh <dir> <expect-429|expect-no-429>}"
MODE="${2:?usage: test-subscribe-rate-limit.sh <dir> <expect-429|expect-no-429>}"
PORT=8799
# $DIR is served live by Cloudflare (assets.directory "."), so the dev
# server's own log/pid go outside it, in a throwaway scratch dir instead.
RUN_TMP="$(mktemp -d)"

cleanup() {
  # npx wraps wrangler in child processes (npm exec -> wrangler cli -> the
  # workerd server), so killing the launcher PID alone leaves the actual
  # server (and its port) behind. Match on the command line instead, which
  # covers the whole tree this script started, then free the port directly
  # as a backstop.
  pkill -f "wrangler dev --port $PORT" 2>/dev/null || true
  sleep 1
  PORT_PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$PORT_PIDS" ] && kill -9 $PORT_PIDS 2>/dev/null || true
  rm -rf "$DIR/.wrangler" "$RUN_TMP"
}
trap cleanup EXIT

( cd "$DIR" && npx wrangler dev --port "$PORT" --local >"$RUN_TMP/wrangler-dev.log" 2>&1 & echo $! >"$RUN_TMP/wrangler-dev.pid" )
WRANGLER_PID="$(cat "$RUN_TMP/wrangler-dev.pid")"

# Wait for the dev server to come up (no Recurly keys are set, so it never
# reaches Recurly; we only need it to answer at all).
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/config"; then break; fi
  sleep 1
done

BODY='{"plan":"monthly","token":"t","email":"a@b.com","first_name":"A","last_name":"B"}'
CODES=()
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/subscribe" \
    -H 'content-type: application/json' -H 'CF-Connecting-IP: 203.0.113.9' --data "$BODY")
  CODES+=("$code")
done

echo "Six POST /api/subscribe status codes: ${CODES[*]}"

has_429=false
for c in "${CODES[@]}"; do [ "$c" = "429" ] && has_429=true; done

if [ "$MODE" = "expect-429" ]; then
  sixth="${CODES[5]}"
  first_five_ok=true
  for c in "${CODES[@]:0:5}"; do [ "$c" = "429" ] && first_five_ok=false; done
  if [ "$sixth" = "429" ] && [ "$first_five_ok" = true ]; then
    echo "PASS: 6th call is 429, first five are not"
    exit 0
  else
    echo "FAIL: expected first five not-429 and 6th call 429"
    exit 1
  fi
else
  if [ "$has_429" = false ]; then
    echo "PASS: no 429 among six calls"
    exit 0
  else
    echo "FAIL: expected no 429 at all"
    exit 1
  fi
fi
