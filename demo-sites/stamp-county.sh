#!/bin/bash
F="$(dirname "$0")/county-emergency/index.html"
TS=$(perl -MPOSIX -e 'print strftime("%Y-%m-%dT%H:%M:%SZ", gmtime(time - 600))') perl -pi -e 's/(id="updated"[^>]*>)[^<]*/$1.$ENV{TS}/e' "$F"
