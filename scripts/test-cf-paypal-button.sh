#!/usr/bin/env bash
# Runs scripts/test-cf-paypal-button.mjs. Input: optionally the path of the snippet to test
# (default clickfunnels/paypal-button.html) - a scratch copy with a deliberate bug makes the test
# go red. Output: the .mjs script's PASS/FAIL lines and its exit code (0 only if all passed).
# Why a wrapper: jsdom is the one dependency, installed into a throwaway npm prefix that is torn
# down when the run ends, so no node_modules ever sits in the repo (everything in the repo folder
# is served publicly).
#
# Usage: scripts/test-cf-paypal-button.sh [snippet.html]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SNIPPET="${1:-$REPO_DIR/clickfunnels/paypal-button.html}"
RUN_TMP="$(mktemp -d)"
trap 'rm -rf "$RUN_TMP"' EXIT

npm install --prefix "$RUN_TMP" --no-save --silent jsdom >"$RUN_TMP/npm-install.log" 2>&1
# Node's ESM loader ignores NODE_PATH, so the test is copied next to the node_modules it needs.
cp "$SCRIPT_DIR/test-cf-paypal-button.mjs" "$RUN_TMP/test-cf-paypal-button.mjs"
node "$RUN_TMP/test-cf-paypal-button.mjs" "$SNIPPET" "$REPO_DIR/assets/wallet-paypal.js"
