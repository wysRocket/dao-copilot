#!/bin/bash
# Simple Taskmaster to GitHub Issues Sync
# Usage: ./sync-tasks-simple.sh [status] [limit]
# Example: ./sync-tasks-simple.sh pending 5

set -e

STATUS="${1:-pending}"
LIMIT="${2:-10}"

echo "🔄 Syncing $STATUS tasks (limit: $LIMIT)"
echo ""

# Check if task-master is available
if ! command -v task-master &> /dev/null; then
    if ! command -v npx &> /dev/null; then
        echo "❌ task-master not found. Install with: npm install -g task-master-ai"
        exit 1
    fi
    TASK_CMD="npx task-master-ai"
else
    TASK_CMD="task-master"
fi

# Check if gh is available
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI not found. Install with: brew install gh"
    exit 1
fi

# Get tasks using task-master
echo "📋 Fetching tasks..."
$TASK_CMD list --status="$STATUS" | head -n "$LIMIT" | while read -r line; do
    # Extract task ID from line (format: "ID: X" or just the number)
    task_id=$(echo "$line" | grep -oE '^[0-9]+' || echo "")
    
    if [ -z "$task_id" ]; then
        continue
    fi
    
    echo ""
    echo "🔍 Processing Task $task_id..."
    
    # Get full task details
    task_info=$($TASK_CMD show "$task_id" 2>/dev/null || echo "")
    
    if [ -z "$task_info" ]; then
        echo "⚠️  Could not fetch details for task $task_id"
        continue
    fi
    
    # Extract title and description
    title=$(echo "$task_info" | grep "^Title:" | sed 's/^Title: *//')
    description=$(echo "$task_info" | grep "^Description:" | sed 's/^Description: *//')
    
    if [ -z "$title" ]; then
        echo "⚠️  No title found for task $task_id"
        continue
    fi
    
    # Check if issue already exists
    existing=$(gh issue list --search "[Task $task_id]" --label "taskmaster" --json number --jq '.[0].number' 2>/dev/null || echo "")
    
    if [ -n "$existing" ]; then
        echo "⏭️  Task $task_id already has issue #$existing"
        continue
    fi
    
    # Create issue
    echo "📝 Creating issue for: $title"
    
    issue_body="## Task $task_id from Taskmaster

**Description:** $description

### Full Details
\`\`\`
$task_info
\`\`\`

---
*Auto-generated from Taskmaster*
*Update: \`task-master update-task --id=$task_id --prompt=\"...\"\`*"
    
    issue_url=$(gh issue create \
        --title "[Task $task_id] $title" \
        --body "$issue_body" \
        --label "taskmaster" 2>&1)
    
    if echo "$issue_url" | grep -q "github.com"; then
        issue_num=$(echo "$issue_url" | grep -oE '[0-9]+$')
        echo "✅ Created issue #$issue_num"
        echo "   $issue_url"
    else
        echo "❌ Failed: $issue_url"
    fi
done

echo ""
echo "✨ Sync complete!"
