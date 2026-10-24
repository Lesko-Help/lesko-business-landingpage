"""The three things every sandbox script here needs: credentials, a token, a call.

Imported by paypal-sandbox-plans.py and paypal-sandbox-verify.py. It exists so
the OAuth dance and the Keychain read live in ONE place: two copies would be
two places to get the sandbox/live distinction wrong, and that distinction is
the only thing standing between a test run and a real charge.

Every call goes to api-m.sandbox.paypal.com and nowhere else. The LIVE
credentials are not reachable from here at all — they are in GCP Secret
Manager (project lesko-486515, secrets paypal-client-id / paypal-secret),
while these are in the macOS Keychain. Two worlds, two stores, on purpose.

The underscored file name is deliberate: `import paypal_sandbox_api` needs a
module name, and Python adds the running script's own folder to the import
path, so the dashed sibling scripts find it with no path juggling.
"""
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.request

BASE = "https://api-m.sandbox.paypal.com"
KEYCHAIN_SERVICE = "leskobusiness-paypal-sandbox"


def die(runnable, code, message):
    """Input: the script's own name, one word from the BTB_ALERT code list, and
    what went wrong. Output: none — it exits non-zero after one line on stderr.
    Why the marker shape even in a hand-run script: it costs nothing and keeps
    every failure in this repo looking the same to a reader (global rule 2).
    stderr needs no flush: it is line-buffered even when piped."""
    sys.exit(f"BTB_ALERT lesko-business-landingpage/{runnable} {code}: {message}")


def keychain(runnable, account):
    """Input: the script's own name, and an account under KEYCHAIN_SERVICE
    ('client_id', 'secret', 'email' or 'password'). Output: the value, stripped.
    Why the Keychain: it keeps the value out of the transcript, out of the
    shell history and out of `ps`, and it is a different store from the live
    credentials. A missing item exits with the command that creates it, because
    the first thing a new reader of this harness hits is not having them."""
    out = subprocess.run(
        ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        die(runnable, "AUTH_FAILED",
            f"no Keychain item '{account}' under service {KEYCHAIN_SERVICE}. Create it with:\n"
            f"  security add-generic-password -U -s {KEYCHAIN_SERVICE} -a {account} -w")
    return out.stdout.strip()


def call(runnable, method, path, token=None, body=None, basic_auth=None):
    """Input: the script's own name, an HTTP verb and a sandbox API path, plus
    either a bearer token or a 'client_id:secret' for the OAuth call, and
    optionally a JSON body. Output: the parsed JSON reply. Why it never returns
    empty on an error: a silent failure here would be read as 'PayPal said
    nothing is wrong', so an HTTP error exits non-zero carrying the body PayPal
    actually sent, and an unreachable host says so rather than looking like a
    verdict about the subscription."""
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    if token:
        headers["Authorization"] = "Bearer " + token
    if basic_auth:
        headers["Authorization"] = "Basic " + base64.b64encode(basic_auth.encode()).decode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = b"grant_type=client_credentials"
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=40) as reply:
            return json.loads(reply.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        die(runnable, "UNEXPECTED", f"{method} {path} -> {err.code} {err.read().decode()[:400]}")
    except urllib.error.URLError as err:
        die(runnable, "SOURCE_FAILED", f"{method} {path} did not answer: {err.reason}")


def token(runnable):
    """Input: the script's own name. Output: a sandbox access token.
    Why a function and not a constant: it is two Keychain reads and a network
    call, and a script that only prints usage should do neither."""
    pair = f"{keychain(runnable, 'client_id')}:{keychain(runnable, 'secret')}"
    return call(runnable, "POST", "/v1/oauth2/token", basic_auth=pair)["access_token"]
