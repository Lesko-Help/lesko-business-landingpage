#!/usr/bin/env bash
# Runs scripts/test-checkout-address.mjs against a directory holding checkout.html. Input: that
# directory (this repo, or a scratch copy of some other commit made with `git archive`). Output:
# the .mjs script's PASS/FAIL lines, and this script's own exit code (0 only if every check
# passed). Exists so jsdom — the one dependency the test needs — never has to be installed into
# the repo itself (no node_modules committed, nothing for Cloudflare to serve); it goes into a
# throwaway npm prefix instead, torn down when the run ends either way.
#
# Usage: scripts/test-checkout-address.sh <dir-to-test>
set -euo pipefail

DIR="${1:?usage: test-checkout-address.sh <dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TMP="$(mktemp -d)"
cleanup() { rm -rf "$RUN_TMP"; }
trap cleanup EXIT

npm install --prefix "$RUN_TMP" --no-save --silent jsdom >"$RUN_TMP/npm-install.log" 2>&1

# Node's ESM loader ignores NODE_PATH, so the test script is copied next to the
# node_modules it needs rather than referenced from the repo directly.
cp "$SCRIPT_DIR/test-checkout-address.mjs" "$RUN_TMP/test-checkout-address.mjs"
node "$RUN_TMP/test-checkout-address.mjs" "$DIR"
