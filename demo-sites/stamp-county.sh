#!/bin/bash
F="$(dirname "$0")/county-emergency/index.html"
TS=$(date -u -v-10M +%Y-%m-%dT%H:%M:%SZ) perl -pi -e 's/(id="updated"[^>]*>)[^<]*/$1.$ENV{TS}/e' "$F"
