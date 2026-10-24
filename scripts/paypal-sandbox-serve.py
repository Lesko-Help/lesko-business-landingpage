#!/usr/bin/env python3
"""Serve a sandbox copy of leskobusiness.com/checkout on localhost.

Input : --client-id (the PayPal SANDBOX client id), --plans (the map written
        by paypal-sandbox-plans.py), --site (a scratch folder to build into)
        and --port. Reads the repo's real pages read-only.
Output: a local site that behaves like production in every way except that its
        PayPal button points at the sandbox, so the whole flow can be clicked
        through with fake money.
Why   : what jsdom cannot answer is what PayPal's REAL SDK does at runtime —
        whether actions.subscription.get() is there and returns the buyer's
        address, whether lockForm() actually kills the card button mid-flow,
        and what lands in /welcome. A live click would cost a real
        subscription, so the page is served locally against the sandbox.

Nothing is written to the repo: the pages are copied into --site and patched
there, so the working tree stays clean and production is untouched. That
matters more here than in most repos, because a hand `wrangler deploy` ships
the folder as it is on disk.

Routes: /checkout -> patched checkout.html, /welcome -> welcome.html,
        /api/config -> the Recurly PUBLIC key (already public: the live Worker
        hands it to every browser), everything else -> the copied files.
"""
import argparse
import http.server
import json
import pathlib
import re
import shutil
import socketserver
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
# Public, not a secret: the live Worker serves this to anyone who loads /checkout.
RECURLY_PUBLIC_KEY = "ewr1-6V6fszebu186N"


def build(site, client_id, plan_map):
    """Input: the scratch folder to build into, the sandbox client id, and the
    {plan key: {plan_id, ...}} map. Output: none; fills the folder with the
    repo's three pages and assets, with wallet-paypal.js repointed at the
    sandbox. Why the asserts: a substitution that silently matched nothing
    would leave the LIVE client id and the LIVE plan ids in the page under
    test, and the harness would then buy a real subscription with real money
    while reporting a sandbox pass. Every substitution must match exactly
    once, or this exits non-zero before a browser is ever opened."""
    if site.exists():
        shutil.rmtree(site)
    (site / "assets").mkdir(parents=True)
    for name in ("checkout.html", "welcome.html", "index.html"):
        shutil.copy(REPO / name, site / name)
    for asset in (REPO / "assets").iterdir():
        if asset.is_file():
            shutil.copy(asset, site / "assets" / asset.name)

    target = site / "assets" / "wallet-paypal.js"
    code = target.read_text()

    code, hits = re.subn(r"(PAYPAL_CLIENT_ID\s*=\s*')[^']*(')",
                         lambda m: m.group(1) + client_id + m.group(2), code)
    if hits != 1:
        sys.exit(f"PAYPAL_CLIENT_ID: expected exactly 1 substitution, made {hits} — "
                 "wallet-paypal.js has been reshaped and the page under test would "
                 "still carry the LIVE client id")

    for key, plan in plan_map.items():
        code, hits = re.subn(r"('" + re.escape(key) + r"':\s*')[^']*(')",
                             lambda m: m.group(1) + plan["plan_id"] + m.group(2),
                             code, count=1)
        if hits != 1:
            sys.exit(f"plan '{key}': expected exactly 1 substitution, made {hits} — "
                     "the page under test would still carry the LIVE plan id")

    target.write_text(code)
    print(f"built {site} — sandbox client id {client_id[:12]}… and "
          f"{len(plan_map)} sandbox plan ids patched in")


def handler_for(site):
    """Input: the built site folder. Output: a request-handler class bound to it.
    Why a factory: SimpleHTTPRequestHandler takes its directory in __init__, and
    http.server hands the class (not an instance) to the server."""

    class Handler(http.server.SimpleHTTPRequestHandler):
        """Serves the built site, plus the two Worker routes the page depends on."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(site), **kwargs)

        def do_GET(self):
            route = self.path.split("?")[0]
            if route == "/api/config":
                body = json.dumps({"recurly_public_key": RECURLY_PUBLIC_KEY}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            # Cloudflare serves /checkout for checkout.html; mirror that here so
            # the page's own links and its /welcome hop work unchanged.
            if route in ("/checkout", "/welcome"):
                query = ("?" + self.path.split("?", 1)[1]) if "?" in self.path else ""
                self.path = route + ".html" + query
            return super().do_GET()

        def log_message(self, fmt, *args):
            sys.stderr.write("  %s\n" % (fmt % args))

    return Handler


def main():
    """Input: the command line. Output: a server on 127.0.0.1:<port> that runs
    until it is killed. Why it binds 127.0.0.1 and not 0.0.0.0: the page it
    serves carries a working PayPal client id, and nothing about this needs to
    be reachable from the network."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--plans", required=True)
    parser.add_argument("--site", required=True)
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    with open(args.plans) as plans_file:
        plan_map = json.load(plans_file)
    build(pathlib.Path(args.site), args.client_id, plan_map)

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", args.port), handler_for(pathlib.Path(args.site))) as httpd:
        print(f"serving http://127.0.0.1:{args.port}/checkout?plan=monthly", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
