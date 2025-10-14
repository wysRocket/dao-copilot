#!/bin/bash
# Taskmaster to GitHub Issues Sync Script
# Author: DAO Copilot Team
# Description: Creates GitHub issues from Taskmaster tasks

set -e

# Add Homebrew to PATH (for gh and jq commands)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
TASKS_JSON=".taskmaster/tasks/tasks.json"
TAG="${1:-master}"
STATUS_FILTER="${2:-pending}"
LABEL="taskmaster"

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}Taskmaster → GitHub Issues Sync${NC}"
echo -e "${BLUE}=====================================${NC}\n"

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    echo -e "${YELLOW}Install it with: brew install gh${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ jq is not installed${NC}"
    echo -e "${YELLOW}Install it with: brew install jq${NC}"
    exit 1
fi

if ! command -v task-master &> /dev/null && ! command -v npx &> /dev/null; then
    echo -e "${RED}✗ task-master is not available${NC}"
    echo -e "${YELLOW}Install it with: npm install -g task-master-ai${NC}"
    exit 1
fi

# Check GitHub authentication
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠ GitHub CLI is not authenticated${NC}"
    echo -e "${YELLOW}Running: gh auth login${NC}\n"
    gh auth login
fi

echo -e "${GREEN}✓ All prerequisites met${NC}\n"

# Function to create issue from task
create_issue_from_task() {
    local task_id="$1"
    local task_title="$2"
    local task_description="$3"
    local task_details="$4"
    local task_priority="$5"
    
    # Check if issue already exists
    existing_issue=$(gh issue list --label "$LABEL" --search "[Task $task_id]" --json number,title --jq '.[0].number' 2>/dev/null || echo "")
    
    if [ -n "$existing_issue" ]; then
        echo -e "${YELLOW}⏭  Task $task_id already has issue #$existing_issue${NC}"
        return
    fi
    
    # Create issue body
    issue_body="## 📋 Taskmaster Task $task_id

**Description:** $task_description

### 🔧 Implementation Details

$task_details

### 🏷️ Metadata
- **Tag:** $TAG
- **Priority:** $task_priority
- **Taskmaster ID:** $task_id
- **Status:** $STATUS_FILTER

---
*This issue was automatically created from Taskmaster.*
*To update the task: \`task-master update-task --id=$task_id --prompt=\"...\"\`*"

    # Determine labels based on priority (try to add, but don't fail if label doesn't exist)
    labels="$LABEL"
    
    # Add tag label
    if [ -n "$TAG" ]; then
        labels="$labels,tag:$TAG"
    fi
    
    case "$task_priority" in
        high)
            labels="$labels,priority:high"
            ;;
        medium)
            labels="$labels,priority:medium"
            ;;
        low)
            labels="$labels,priority:low"
            ;;
    esac
    
    # Create the issue - first try with priority label
    issue_url=$(gh issue create \
        --title "[Task $task_id] $task_title" \
        --body "$issue_body" \
        --label "$labels" 2>&1)
    
    # If it failed due to label, try without priority label
    if echo "$issue_url" | grep -q "not found"; then
        echo -e "${YELLOW}   ⚠ Priority label not found, creating without it${NC}"
        issue_url=$(gh issue create \
            --title "[Task $task_id] $task_title" \
            --body "$issue_body" \
            --label "$LABEL" 2>&1)
    fi
    
    if echo "$issue_url" | grep -q "github.com"; then
        issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
        echo -e "${GREEN}✓ Created issue #$issue_number for Task $task_id${NC}"
        echo -e "${BLUE}   $issue_url${NC}"
        
        # Update task with issue reference
        if command -v task-master &> /dev/null; then
            task-master update-task --id="$task_id" --prompt="Created GitHub issue #$issue_number for tracking" --append 2>/dev/null || true
        fi
        return 0
    else
        echo -e "${RED}✗ Failed to create issue for Task $task_id${NC}"
        echo -e "${RED}   Error: $issue_url${NC}"
        return 1
    fi
}

# Main execution
echo -e "${BLUE}Fetching tasks from tag: $TAG (status: $STATUS_FILTER)${NC}\n"

# Use task-master CLI to get tasks
if command -v task-master &> /dev/null; then
    TASK_CMD="task-master"
else
    TASK_CMD="npx task-master-ai"
fi

# Get task list
task_list=$($TASK_CMD list --status="$STATUS_FILTER" --tag="$TAG" 2>/dev/null || echo "")

if [ -z "$task_list" ]; then
    echo -e "${YELLOW}No $STATUS_FILTER tasks found in tag: $TAG${NC}"
    exit 0
fi

# Parse tasks using jq from tasks.json
if [ ! -f "$TASKS_JSON" ]; then
    echo -e "${RED}✗ Tasks file not found: $TASKS_JSON${NC}"
    exit 1
fi

# Extract tasks matching the status filter and create issues
task_count=0
issue_count=0

while IFS= read -r task_json; do
    id=$(echo "$task_json" | jq -r '.id')
    title=$(echo "$task_json" | jq -r '.title')
    description=$(echo "$task_json" | jq -r '.description')
    details=$(echo "$task_json" | jq -r '.details // ""' | head -c 5000)  # Limit details to 5000 chars
    priority=$(echo "$task_json" | jq -r '.priority // "medium"')
    
    task_count=$((task_count + 1))
    
    if [ -z "$title" ] || [ "$title" = "null" ]; then
        echo -e "${YELLOW}⏭  Skipping task $id (no title)${NC}"
        continue
    fi
    
    echo -e "${BLUE}Processing Task $id: $title${NC}"
    
    if create_issue_from_task "$id" "$title" "$description" "$details" "$priority"; then
        issue_count=$((issue_count + 1))
    fi
    
    echo ""
done < <(jq -c --arg tag "$TAG" --arg status "$STATUS_FILTER" \
    '.[$tag].tasks[] | select(.status == $status)' "$TASKS_JSON")

echo -e "${GREEN}Processed $task_count tasks, created $issue_count issues${NC}"

echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}Sync completed!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "\nView issues: ${BLUE}gh issue list --label $LABEL${NC}"
