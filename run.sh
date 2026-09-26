#!/usr/bin/env bash
# Builds and serves dist/ on this computer. LAN=1 also serves it to phones on the same Wi-Fi.
set -e
cd "$(dirname "$0")"
python3 build.py
PORT="${PORT:-8787}"
BIND=127.0.0.1; [ "${LAN:-0}" = 1 ] && BIND=0.0.0.0
[ "$BIND" = 0.0.0.0 ] && echo "Phone URL: http://$(hostname -I | awk '{print $1}'):$PORT/"
(sleep 1; xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1 || true) &
exec python3 -m http.server "$PORT" --bind "$BIND" --directory dist
