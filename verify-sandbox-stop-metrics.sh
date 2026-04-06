#!/bin/bash
# Create a sandbox, let it run, stop it, and show billing metrics.
# Usage: VERCEL_API_TOKEN=xxx VERCEL_PROJECT_ID=xxx ./verify-sandbox-stop-metrics.sh
# Optional: VERCEL_TEAM_ID=xxx

set -euo pipefail

: "${VERCEL_API_TOKEN:?Set VERCEL_API_TOKEN}"
: "${VERCEL_PROJECT_ID:?Set VERCEL_PROJECT_ID}"

BASE="https://api.vercel.com/v1/sandboxes"
QS=""
[[ -n "${VERCEL_TEAM_ID:-}" ]] && QS="?teamId=$VERCEL_TEAM_ID"
AUTH="Authorization: Bearer $VERCEL_API_TOKEN"

# 1. Create
echo "Creating sandbox..."
CREATE=$(curl -s -X POST "$BASE$QS" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"runtime\":\"node24\",\"projectId\":\"$VERCEL_PROJECT_ID\"}")

ID=$(echo "$CREATE" | jq -r '.sandbox.id')
STATUS=$(echo "$CREATE" | jq -r '.sandbox.status')

if [[ "$ID" == "null" ]]; then
  echo "❌ Failed to create sandbox:"
  echo "$CREATE" | jq .
  exit 1
fi

echo "  id: $ID  status: $STATUS"

# 2. Wait for it to start
echo "Waiting 3s for sandbox to run..."
sleep 3

# 3. Stop
echo "Stopping sandbox..."
curl -s -X POST "$BASE/$ID/stop$QS" \
  -H "$AUTH" -H "Content-Type: application/json" > /dev/null

# 4. Poll until status is "stopped" and duration is populated
echo "Waiting for stopped state..."
for i in $(seq 1 20); do
  STOP=$(curl -s "$BASE/$ID$QS" -H "$AUTH")
  S=$(echo "$STOP" | jq -r '.sandbox.status')
  D=$(echo "$STOP" | jq '.sandbox.duration // empty')
  if [[ "$S" == "stopped" && -n "$D" ]]; then
    break
  fi
  sleep 1
done

# 5. Show billing metrics
echo ""
echo "=== Billing Metrics ==="
echo "$STOP" | jq '{
  id:             .sandbox.id,
  status:         .sandbox.status,
  duration_ms:    .sandbox.duration,
  duration_sec:   ((.sandbox.duration // 0) / 1000),
  startedAt:      ((.sandbox.startedAt // 0) / 1000 | todate),
  stoppedAt:      ((.sandbox.stoppedAt // 0) / 1000 | todate),
  memory_mb:      .sandbox.memory,
  vcpus:          .sandbox.vcpus,
  region:         .sandbox.region,
  runtime:        .sandbox.runtime,
  estimated_cost: (((.sandbox.duration // 0) / 1000) * .sandbox.vcpus * 0.000014)
}'

echo ""
echo "=== Raw Response ==="
echo "$STOP" | jq .sandbox
