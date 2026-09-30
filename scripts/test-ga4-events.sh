#!/usr/bin/env bash
# Runs scripts/test-ga4-events.mjs against a directory of the three pages. Input: a directory
# holding index.html, checkout.html, welcome.html (and assets/analytics.js when the branch being
# tested has one). Output: the .mjs script's PASS/FAIL lines, and this script's own exit code (0
# only if every check passed). Exists so jsdom — the one dependency the test needs — never has to
# be installed into the repo itself (no node_modules committed, nothing for Cloudflare to serve);
# it goes into a throwaway npm prefix instead, torn down when the run ends either way.
#
# Usage: scripts/test-ga4-events.sh <dir-to-test>
set -euo pipefail

DIR="${1:?usage: test-ga4-events.sh <dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TMP="$(mktemp -d)"
cleanup() { rm -rf "$RUN_TMP"; }
trap cleanup EXIT

npm install --prefix "$RUN_TMP" --no-save --silent jsdom >"$RUN_TMP/npm-install.log" 2>&1

# Node's ESM loader ignores NODE_PATH, so the test script is copied next to the
# node_modules it needs rather than referenced from the repo directly.
cp "$SCRIPT_DIR/test-ga4-events.mjs" "$RUN_TMP/test-ga4-events.mjs"
node "$RUN_TMP/test-ga4-events.mjs" "$DIR"
