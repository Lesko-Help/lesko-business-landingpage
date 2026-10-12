#!/usr/bin/env bash
# Runs scripts/test-wallet-paypal.mjs against a directory holding checkout.html and assets/*.
# Input: that directory (this repo, or a scratch copy of some other commit made with `git
# archive`). Output: the .mjs script's PASS/FAIL lines, and this script's own exit code (0 only
# if every check passed). Mirrors scripts/test-wallet-seam.sh — jsdom goes into a throwaway npm
# prefix, never into this repo's own (nonexistent) node_modules.
#
# Usage: scripts/test-wallet-paypal.sh <dir-to-test>
set -euo pipefail

DIR="${1:?usage: test-wallet-paypal.sh <dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_TMP="$(mktemp -d)"
cleanup() { rm -rf "$RUN_TMP"; }
trap cleanup EXIT

npm install --prefix "$RUN_TMP" --no-save --silent jsdom >"$RUN_TMP/npm-install.log" 2>&1

cp "$SCRIPT_DIR/test-wallet-paypal.mjs" "$RUN_TMP/test-wallet-paypal.mjs"
node "$RUN_TMP/test-wallet-paypal.mjs" "$DIR"
