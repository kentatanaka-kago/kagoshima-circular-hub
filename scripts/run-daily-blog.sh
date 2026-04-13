#!/bin/bash
# Wrapper invoked by launchd. Sets up PATH (launchd has a minimal env),
# loads .env.local implicitly via daily-blog.ts, and logs output.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p logs
stamp=$(date +%Y%m%d-%H%M%S)
npx tsx scripts/daily-blog.ts 2>&1 | tee "logs/daily-blog-${stamp}.log"
