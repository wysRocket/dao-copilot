#!/bin/bash
# GitHub Issue → Taskmaster Sync Script
# Author: DAO Copilot Team
# Description: Updates Taskmaster task status when GitHub issues are closed

set -e

# Add Homebrew to PATH (for gh command)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}GitHub Issues → Taskmaster Sync${NC}"
echo -e "${BLUE}=====================================${NC}\n"

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    exit 1
fi

if ! command -v task-master &> /dev/null && ! command -v npx &> /dev/null; then
    echo -e "${RED}✗ task-master is not available${NC}"
    exit 1
fi

# Determine task-master command
if command -v task-master &> /dev/null; then
    TASK_CMD="task-master"
else
    TASK_CMD="npx task-master-ai"
fi

# Get all closed issues with taskmaster label
closed_issues=$(gh issue list --state closed --label "taskmaster" --json number,title,body --limit 100)

if [ "$closed_issues" = "[]" ]; then
    echo -e "${YELLOW}No closed taskmaster issues found${NC}"
    exit 0
fi

echo -e "${GREEN}Found $(echo "$closed_issues" | jq length) closed issues${NC}\n"

# Process each closed issue
echo "$closed_issues" | jq -c '.[]' | while read -r issue; do
    issue_number=$(echo "$issue" | jq -r '.number')
    issue_title=$(echo "$issue" | jq -r '.title')
    
    # Extract task ID from title [Task X]
    task_id=$(echo "$issue_title" | grep -oE '\[Task [0-9.]+\]' | grep -oE '[0-9.]+' || echo "")
    
    if [ -z "$task_id" ]; then
        echo -e "${YELLOW}⏭  Issue #$issue_number has no task ID in title${NC}"
        continue
    fi
    
    echo -e "${BLUE}Processing Issue #$issue_number → Task $task_id${NC}"
    
    # Check current task status
    current_status=$($TASK_CMD show "$task_id" 2>/dev/null | grep "Status:" | cut -d':' -f2 | xargs || echo "")
    
    if [ "$current_status" = "done" ]; then
        echo -e "${GREEN}✓ Task $task_id is already marked as done${NC}\n"
        continue
    fi
    
    # Update task status
    if $TASK_CMD set-status --id="$task_id" --status=done 2>/dev/null; then
        echo -e "${GREEN}✓ Marked Task $task_id as done (from Issue #$issue_number)${NC}"
        
        # Add comment to issue
        gh issue comment "$issue_number" --body "✅ Taskmaster Task $task_id has been marked as done." 2>/dev/null || true
    else
        echo -e "${RED}✗ Failed to update Task $task_id${NC}"
    fi
    echo ""
done

echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}Sync completed!${NC}"
echo -e "${GREEN}=====================================${NC}"
