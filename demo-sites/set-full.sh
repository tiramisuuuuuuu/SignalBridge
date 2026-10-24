#!/bin/bash
DIR="$(dirname "$0")/shelter-status"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ) perl -pe 's/(id="updated"[^>]*>)[^<]*/$1.$ENV{TS}/e' "$DIR/index.full.html" > "$DIR/index.html"
echo "Marina is now FULL (updated $(date -u +%H:%M:%S) UTC)"
