#!/usr/bin/env python3
"""
Serve the app with caching turned OFF.

The app loads its JavaScript as many small ES modules with plain relative paths
and no version tags. A browser is free to cache each of those, and it does — so
after an update you can end up running a MIX of new and old modules until a hard
refresh, which at best shows stale behaviour and at worst fails to load (a new
file importing something an old cached file does not export yet).

Rather than fight it with hashed filenames (which would need a build step this
"no-build" app deliberately avoids), this dev server tells the browser never to
cache anything: every reload fetches the current files, so what you see is always
the latest code. Run it with `npm run serve` (or `python serve.py <port>`).
"""

import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # No-store on everything: the browser must re-fetch each file every time,
        # so a fresh checkout is live the moment you reload — no stale modules.
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    with socketserver.ThreadingTCPServer(('', PORT), NoCacheHandler) as httpd:
        httpd.allow_reuse_address = True
        print(f'Serving with no-store caching on http://localhost:{PORT}  (Ctrl+C to stop)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
