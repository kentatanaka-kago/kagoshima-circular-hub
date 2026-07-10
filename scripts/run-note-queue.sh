#!/bin/bash
# Wrapper invoked by launchd every 5 minutes (com.kagoshima-circular-hub.note-queue).
# Cheaply checks the queue via Supabase REST first so we don't pay the
# npx/tsx/Playwright startup cost when nothing is requested.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Load env for the REST pre-check (publish-queued.ts loads .env.local itself).
SUPABASE_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
SERVICE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)

if [ -n "$SUPABASE_URL" ] && [ -n "$SERVICE_KEY" ]; then
  count=$(curl -s "$SUPABASE_URL/rest/v1/news_articles?select=id&note_publish_requested_at=not.is.null&note_draft_url=is.null&limit=1" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | grep -c '"id"' || true)
  if [ "$count" -eq 0 ]; then
    exit 0
  fi
fi

mkdir -p logs
stamp=$(date +%Y%m%d-%H%M%S)
echo "[note-queue] ${stamp} queue not empty — running publish-queued.ts"
npx tsx scripts/publish-queued.ts 2>&1 | tee "logs/note-queue-${stamp}.log"
