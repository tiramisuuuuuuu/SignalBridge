#!/bin/bash
DIR="$(dirname "$0")/shelter-status"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ) perl -pe 's/(id="updated"[^>]*>)[^<]*/$1.$ENV{TS}/e' "$DIR/index.original.html" > "$DIR/index.html"
echo "Marina is now OPEN (updated $(date -u +%H:%M:%S) UTC)"
"$(dirname "$0")/stamp-county.sh"
