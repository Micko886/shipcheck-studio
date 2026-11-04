#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo '请先安装 Node.js 22.19+（https://nodejs.org/）'; exit 1; fi
if [ ! -f node_modules/lighthouse/cli/index.js ]; then npm install --no-audit --no-fund; fi
exec node server.cjs
