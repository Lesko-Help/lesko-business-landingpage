#!/usr/bin/env python3
"""Ask PayPal whether the subscription the browser just made really exists.

Input : argv[1] a subscription id (I-…), argv[2] the plan key it was bought on,
        argv[3] the plan map from paypal-sandbox-plans.py. Credentials from the
        Keychain, the sandbox buyer's address included, so the subscriber can be
        compared without it being typed anywhere.
Output: one PASS/FAIL line per claim; exit 0 only when every claim held.
Why   : this is claim D, and the one the browser cannot make. Everything
        paypal-sandbox-buy.js sees, it sees through our own page — so a page
        that cheerfully navigated to /welcome without a subscription behind it
        would look like a pass. On 2026-10-23 this was done by hand, which
        meant a re-run would not have re-proved it; that is why it is a script.

What it checks, and what it deliberately does NOT:
  D1 the subscription is ACTIVE — not APPROVAL_PENDING, which is what a flow
     that was never actually approved leaves behind
  D2 it is on the plan belonging to the ?plan= key that was clicked — this is
     the cross-wiring check, the one real risk in a three-button page, and the
     reason yearly is worth re-proving every time
  D3 PayPal took the price the PAGE promised for that plan
  D4 the subscriber PayPal recorded is the sandbox buyer, which is the other
     half of claim C: the browser proved that address reached /welcome, this
     proves it is the address PayPal actually holds
It does not re-prove the LIVE prices or the LIVE plan ids. Those are pinned by
scripts/test-wallet-paypal.sh (wallets P2) against checkout.html, with no
network and no money involved, which is the right place for them.
"""
import json
import sys
import time

import paypal_sandbox_api as api

ME = "paypal-sandbox-verify"
# PayPal posts the first payment a moment after activation, so a check that ran
# the instant the browser finished would fail on timing rather than on truth.
PAYMENT_WAIT_SECONDS = 30
POLL_SECONDS = 3

failures = 0


def say(ok, label, extra=None):
    """Input: whether the claim held, its label, and optionally what was seen.
    Output: one line on stdout and a bump of the module-level failure count.
    Why count instead of raising: a bad run should report every claim, not stop
    at the first, so the reader sees the whole picture in one go."""
    global failures
    if not ok:
        failures += 1
    print(f"{'PASS' if ok else 'FAIL'} - {label}" + (f"  ({extra})" if extra is not None else ""))


def last_payment(subscription):
    """Input: a subscription as PayPal returns it. Output: the amount of its last
    payment as a string, or None when PayPal has not posted one yet. Why its own
    function: the field is nested three deep and absent on a fresh subscription,
    and a KeyError here would read as a failed test rather than as 'not yet'."""
    billing = subscription.get("billing_info") or {}
    payment = billing.get("last_payment") or {}
    amount = payment.get("amount") or {}
    return amount.get("value")


def main():
    """Input: the command line. Output: the four PASS/FAIL lines, and an exit
    code that is 0 only if all four held. Why it re-reads the subscription in a
    loop: only the payment needs waiting for; the status, plan and subscriber
    are there immediately, but re-reading all of them together keeps one shape
    of request and one error path."""
    if len(sys.argv) != 4:
        sys.exit("usage: paypal-sandbox-verify.py <subscription-id> <plan-key> <plan-map.json>")
    subscription_id, plan_key, plans_path = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(plans_path) as plans_file:
        plan = json.load(plans_file)[plan_key]

    token = api.token(ME)
    buyer_email = api.keychain(ME, "email")

    print(f"--- verifying {subscription_id} ({plan_key}) ---")
    deadline = time.monotonic() + PAYMENT_WAIT_SECONDS
    while True:
        subscription = api.call(ME, "GET", f"/v1/billing/subscriptions/{subscription_id}",
                                token=token)
        paid = last_payment(subscription)
        if paid is not None or time.monotonic() >= deadline:
            break
        time.sleep(POLL_SECONDS)

    status = subscription.get("status")
    say(status == "ACTIVE", "D1: PayPal says the subscription is ACTIVE", status)

    got_plan = subscription.get("plan_id")
    say(got_plan == plan["plan_id"],
        f"D2: it is on the sandbox plan for '{plan_key}', so the buttons are not cross-wired",
        got_plan if got_plan == plan["plan_id"] else f"{got_plan}, expected {plan['plan_id']}")

    say(paid == plan["price"],
        "D3: PayPal took the price the page promised for this plan",
        f"${paid}" if paid == plan["price"] else
        (f"nothing posted within {PAYMENT_WAIT_SECONDS}s" if paid is None
         else f"${paid}, expected ${plan['price']}"))

    subscriber = (subscription.get("subscriber") or {}).get("email_address") or ""
    say(subscriber.lower() == buyer_email.lower(),
        "D4: the subscriber PayPal recorded is the sandbox buyer",
        "matches" if subscriber.lower() == buyer_email.lower()
        else "does NOT match the Keychain buyer address")

    sys.exit(0 if failures == 0 else 1)


if __name__ == "__main__":
    main()
