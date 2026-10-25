#!/bin/sh
# Lance un petit serveur local puis ouvrez http://localhost:8000
cd "$(dirname "$0")" && echo "http://localhost:8000" && python3 -m http.server 8000
