#!/usr/bin/env python3
"""Create (or reuse) the sandbox twins of Lesko's three live PayPal plans.

Input : the repo's own checkout.html, for the three prices it shows buyers, and
        the sandbox API credentials from the macOS Keychain (see
        paypal_sandbox_api.py). argv[1] is the path to write the plan map to.
Output: one sandbox product and three sandbox plans; their ids, prices and
        intervals written as JSON to that path. Idempotent by plan name: a plan
        whose name already exists is reused, so re-running leaves three plans
        and not nine.
Why   : the sandbox is a separate PayPal world with its own plan ids, so the
        real flow cannot be clicked through without twins of the live plans.
        The prices are read off checkout.html rather than typed here so the
        twins always charge what the page promises; a price changed on the page
        changes the plan name, and a new twin is created for it rather than an
        old one being silently reused at the old price.

Writes to PayPal SANDBOX only. It cannot take real money and it touches
nothing in the live account.
"""
import json
import pathlib
import re
import sys

import paypal_sandbox_api as api

ME = "paypal-sandbox-plans"
REPO = pathlib.Path(__file__).resolve().parent.parent
PRODUCT_NAME = "LeskoHelp Pro (sandbox)"

# How often each plan bills, as (our ?plan= key, interval unit, interval count).
# Structural, so it is written here; the PRICE is read off the page instead.
# The live account's product has a price baked into its NAME, which is why its
# dashboard reads "6 Months - $89.95" against all three plans and confuses
# everyone who opens it; PayPal does not allow renaming a product, so this one
# is named without a price on purpose.
INTERVALS = [
    ("monthly", "MONTH", 1),
    ("half-year", "MONTH", 6),
    ("yearly", "YEAR", 1),
]


def page_prices():
    """Input: nothing; reads checkout.html at the repo root. Output: {plan key:
    price as a plain string, e.g. '29.95'} taken from the page's own PLANS
    object. Why read the page instead of typing the prices again: this repo
    already keeps the prices in several hand-maintained places, and one more
    copy here would let the sandbox charge one number while the page promises
    another — the one thing this harness must never do quietly. A plan the page
    does not price is a hard error, never a guess."""
    html = (REPO / "checkout.html").read_text()
    prices = {}
    for key, _unit, _count in INTERVALS:
        found = re.search(r"'" + re.escape(key) + r"':\s*\{[^}]*total:\s*'\$([0-9]+\.[0-9]{2})'", html)
        if not found:
            api.die(ME, "SOURCE_FAILED",
                    f"checkout.html has no price for plan '{key}' — its PLANS object has moved "
                    "or been reshaped, and guessing a price here would charge the sandbox "
                    "something the page never promised")
        prices[key] = found.group(1)
    return prices


def product_id(token):
    """Input: a sandbox access token. Output: the id of the sandbox product,
    created on the first run and reused after. Why a product at all: PayPal
    hangs billing plans off one, and three runs should not leave three."""
    existing = api.call(ME, "GET", "/v1/catalogs/products?page_size=20",
                        token=token).get("products", [])
    found = next((p for p in existing if p.get("name") == PRODUCT_NAME), None)
    if found:
        print(f"product (reused):  {found['id']}")
        return found["id"]
    created = api.call(ME, "POST", "/v1/catalogs/products", token=token, body={
        "name": PRODUCT_NAME,
        "description": "Sandbox twin of the live LeskoHelp Pro membership.",
        "type": "SERVICE",
        "category": "SOFTWARE",
    })
    print(f"product (created): {created['id']}")
    return created["id"]


def main():
    """Input: argv[1], the path to write the plan map to. Output: that file, plus
    one line per plan on stdout. Why a file and not stdout alone: the two
    scripts downstream (the server and the buyer) both need the same map, and
    passing it on a command line would put it through the shell twice."""
    if len(sys.argv) != 2:
        sys.exit("usage: paypal-sandbox-plans.py <path-to-write-plan-map.json>")
    out_path = pathlib.Path(sys.argv[1])

    prices = page_prices()
    token = api.token(ME)
    product = product_id(token)

    have = {
        plan.get("name"): plan["id"]
        for plan in api.call(ME, "GET", f"/v1/billing/plans?product_id={product}&page_size=20",
                             token=token).get("plans", [])
    }

    plan_map = {}
    for key, unit, count in INTERVALS:
        price = prices[key]
        # The price is in the name on purpose: the run stays idempotent while the
        # price is unchanged, and forces a NEW twin the moment the page's moves.
        name = f"SANDBOX LeskoHelp {key} {price}"
        if name in have:
            plan_id = have[name]
            print(f"  {key:<10} reused   {plan_id}  ${price} / {count} {unit}")
        else:
            plan_id = api.call(ME, "POST", "/v1/billing/plans", token=token, body={
                "product_id": product,
                "name": name,
                "status": "ACTIVE",
                "billing_cycles": [{
                    "frequency": {"interval_unit": unit, "interval_count": count},
                    "tenure_type": "REGULAR",
                    "sequence": 1,
                    "total_cycles": 0,
                    "pricing_scheme": {"fixed_price": {"value": price, "currency_code": "USD"}},
                }],
                # Mirrors the live plans: four failed rebills before suspension
                # (Martin, 2026-10-17).
                "payment_preferences": {
                    "auto_bill_outstanding": True,
                    "setup_fee_failure_action": "CONTINUE",
                    "payment_failure_threshold": 4,
                },
            })["id"]
            print(f"  {key:<10} created  {plan_id}  ${price} / {count} {unit}")
        plan_map[key] = {"plan_id": plan_id, "price": price,
                         "interval_unit": unit, "interval_count": count}

    out_path.write_text(json.dumps(plan_map, indent=2) + "\n")
    print(f"\nplan map written to {out_path}")


if __name__ == "__main__":
    main()
