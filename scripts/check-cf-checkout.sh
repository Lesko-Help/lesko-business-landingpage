#!/usr/bin/env bash
# Live check that the ClickFunnels order pages on checkout.leskobusiness.com are really there
# (page spec B7). Run by hand; it is not scheduled, so it needs no alert. It exists because the
# links on leskobusiness.com may only move to these pages once they serve (page B6): until then
# every path on that host answers 302 to clickfunnels.com's own home page.
#
# Input:  nothing. Optional environment, for testing against a stand-in server only:
#           CF_CHECKOUT_BASE  default https://checkout.leskobusiness.com
#           CF_PACE_SECONDS   default 5 (pause between requests)
# Output: one line per plan with its verdict, then a summary. Exit 0 only when all three plans
#         are live; exit 1 otherwise (dead or unknown both count as not ready).
#
# A verdict has three values, never two (CLAUDE.md "A crawler's refusal is not an answer"):
#   live     HTTP 200 and the page carries its own page id, its own plan id (business-cf-<plan>, the
#            CF-only Recurly plans of page B1, not the business-<plan> of the retired /checkout), its own price, our
#            PayPal client id, and exactly our three PayPal plan ids (page B1a) and no other.
#   dead     the host answered and it is the wrong thing: a redirect, a 404, a wrong id/plan/price,
#            no client id, or a PayPal plan id that is not ours (a ClickFunnels-account plan).
#   unknown  the host did not answer properly: 429, any 5xx, a timeout, a reset, or a "dead"
#            read that came out of Cloudflare's cache instead of the origin. Never written as dead.
#
# One request at a time, paced, redirects NOT followed (a 302 is itself the answer), and an honest
# User-Agent naming this repo and script (a bare curl gets Cloudflare's "Attention Required").
set -uo pipefail

BASE="${CF_CHECKOUT_BASE:-https://checkout.leskobusiness.com}"
PACE="${CF_PACE_SECONDS:-5}"
USER_AGENT="lesko-business-landingpage/scripts/check-cf-checkout.sh (hand check; contact martin.j.menke@gmail.com)"

# The numeric ClickFunnels page id of each copy: the `value` of a hidden input on the page (the
# page_id meta tag is encrypted). Read live from the three copies on 2026-10-27 (page B1). A page
# whose id differs reads dead, which is the honest answer if a copy is ever rebuilt.
PAGE_ID_MONTHLY="64133517"
PAGE_ID_HALF_YEAR="64133609"
PAGE_ID_YEARLY="64133610"

# Our PayPal client id and the three PayPal plan ids are read out of assets/wallet-paypal.js, the
# one place they live in the page code, so this script is not a third copy to keep in step.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WALLET_FILE="$REPO_DIR/assets/wallet-paypal.js"
PAYPAL_CLIENT_ID="$(sed -n "s/.*PAYPAL_CLIENT_ID = '\([^']*\)'.*/\1/p" "$WALLET_FILE")"
OUR_PAYPAL_PLAN_IDS="$(grep -o "P-[0-9A-Z]\{24\}" "$WALLET_FILE" | sort -u)"
if [ -z "$PAYPAL_CLIENT_ID" ] || [ "$(echo "$OUR_PAYPAL_PLAN_IDS" | wc -l | tr -d ' ')" != "3" ]; then
  echo "cannot read our PayPal client id and three plan ids from $WALLET_FILE" >&2
  exit 2
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Input: a plan name (monthly | half-year | yearly) and the page id expected on its page, and its
# price. Output: prints "<plan> <verdict>: <reason>" and returns 0 only for live. Why: one place
# holds the three-valued logic, so the three plans cannot drift apart.
check_plan() {
  local plan="$1" expected_page_id="$2" expected_price="$3"
  local url="$BASE/$plan" body="$WORK_DIR/$plan.body" headers="$WORK_DIR/$plan.headers"
  local status curl_exit

  status="$(curl -s -o "$body" -D "$headers" -w '%{http_code}' --max-time 20 \
    -A "$USER_AGENT" "$url")"
  curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    echo "$plan unknown: curl exit $curl_exit (timeout or connection problem)"; return 1
  fi
  if [ "$status" = "429" ] || [ "${status:0:1}" = "5" ]; then
    echo "$plan unknown: HTTP $status (host refusing or failing, says nothing about the page)"; return 1
  fi

  # A HIT or REVALIDATED answer is the edge's memory, not the origin's (CLAUDE.md rule 7).
  local cache_status
  cache_status="$(grep -i '^cf-cache-status:' "$headers" | tr -d '\r' | awk '{print toupper($2)}')"

  local reason=""
  if [ "$status" != "200" ]; then
    local location
    location="$(grep -i '^location:' "$headers" | tr -d '\r' | cut -d' ' -f2-)"
    reason="HTTP $status${location:+ to $location}, not an order page"
  elif ! grep -qF "value=\"$expected_page_id\"" "$body"; then
    reason="page id $expected_page_id not found in the page"
  elif ! grep -qF "data-product-payment-gateway-plan-id=\"business-cf-$plan\"" "$body"; then
    reason="data-product-payment-gateway-plan-id is not business-cf-$plan"
  elif ! grep -qF "data-product-amount=\"$expected_price\"" "$body"; then
    reason="data-product-amount is not $expected_price"
  elif ! grep -qF "$PAYPAL_CLIENT_ID" "$body"; then
    reason="our PayPal client id is not on the page (no PayPal button snippet?)"
  else
    # The PayPal plan ids on the page must be exactly our three: a missing one or any other
    # P-... id (ClickFunnels' own PayPal plan) means the page would bill the wrong plan.
    local found_ids
    found_ids="$(grep -o "P-[0-9A-Z]\{24\}" "$body" | sort -u)"
    if [ "$found_ids" != "$OUR_PAYPAL_PLAN_IDS" ]; then
      reason="PayPal plan ids on the page are not exactly ours: found [$(echo $found_ids)]"
    fi
  fi

  if [ -z "$reason" ]; then
    echo "$plan live: page $expected_page_id, plan business-cf-$plan, \$$expected_price (cache: ${cache_status:-none})"
    return 0
  fi
  if [ "$cache_status" = "HIT" ] || [ "$cache_status" = "REVALIDATED" ]; then
    echo "$plan unknown: $reason - but cf-cache-status $cache_status, so this is the edge, not the origin"
    return 1
  fi
  echo "$plan dead: $reason (cache: ${cache_status:-none})"
  return 1
}

failures=0
check_plan monthly   "$PAGE_ID_MONTHLY"   "29.95"  || failures=$((failures + 1))
sleep "$PACE"
check_plan half-year "$PAGE_ID_HALF_YEAR" "89.95"  || failures=$((failures + 1))
sleep "$PACE"
check_plan yearly    "$PAGE_ID_YEARLY"    "149.95" || failures=$((failures + 1))

if [ "$failures" -eq 0 ]; then
  echo "ALL LIVE: the three CF order pages serve; the links may move (page B6)."
  exit 0
fi
echo "NOT READY: $failures of 3 plans are not live. Do not land the link change."
exit 1
