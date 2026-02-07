#!/bin/bash

# Safe deletion script for Dockhand Tavern Peekaping monitors
# Only deletes monitors tagged with "dockhand-tavern"
# Usage: PEEKAPING_URL=http://localhost:8034 PEEKAPING_API_KEY=your-key ./delete-dockhand-monitors.sh

# Configuration from environment variables
API_KEY="${PEEKAPING_API_KEY:-}"
BASE_URL="${PEEKAPING_URL:-http://localhost:8034}/api/v1"

# Validate required environment variables
if [ -z "$API_KEY" ]; then
    echo "❌ Error: PEEKAPING_API_KEY environment variable is required"
    echo "Usage: PEEKAPING_URL=http://localhost:8034 PEEKAPING_API_KEY=your-key $0"
    exit 1
fi

echo "🔍 Finding dockhand-tavern tag..."
DOCKHAND_TAG_ID=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/tags" | jq -r '.data[] | select(.name == "dockhand-tavern") | .id')

if [ -z "$DOCKHAND_TAG_ID" ]; then
    echo "❌ No dockhand-tavern tag found. Nothing to delete."
    exit 0
fi

echo "✅ Found dockhand-tavern tag: $DOCKHAND_TAG_ID"
echo ""

echo "🔍 Fetching all monitors..."
MONITOR_IDS=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/monitors?limit=1000" | jq -r '.data[].id')

DELETED=0
SKIPPED=0

for MONITOR_ID in $MONITOR_IDS; do
    # Fetch individual monitor to get tag_ids
    MONITOR=$(curl -s -H "X-API-Key: $API_KEY" "$BASE_URL/monitors/$MONITOR_ID")
    MONITOR_NAME=$(echo "$MONITOR" | jq -r '.data.name')
    TAG_IDS=$(echo "$MONITOR" | jq -r '.data.tag_ids[]?' 2>/dev/null)
    
    # Check if this monitor has the dockhand-tavern tag
    if echo "$TAG_IDS" | grep -q "$DOCKHAND_TAG_ID"; then
        echo "🗑️  Deleting monitor: $MONITOR_NAME (ID: $MONITOR_ID)"
        curl -s -X DELETE -H "X-API-Key: $API_KEY" "$BASE_URL/monitors/$MONITOR_ID" > /dev/null
        ((DELETED++))
    else
        echo "⏭️  Skipping monitor: $MONITOR_NAME (no dockhand-tavern tag)"
        ((SKIPPED++))
    fi
done

echo ""
echo "✅ Done! Deleted: $DELETED, Skipped: $SKIPPED"
