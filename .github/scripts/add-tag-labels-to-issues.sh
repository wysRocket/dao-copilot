#!/bin/bash
# Add tag labels to existing Taskmaster issues based on task metadata
# This script reads each issue, determines its tag from Taskmaster, and adds the appropriate label

set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Add Tag Labels to Existing Issues        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}\n"

# Get all tags
TAGS=$(cat .taskmaster/tasks/tasks.json | jq -r 'keys[]')

echo -e "${BLUE}Processing all Taskmaster issues...${NC}\n"

UPDATED=0
FAILED=0

# Get all issues with taskmaster label
ISSUES=$(gh issue list --label taskmaster --repo wysRocket/dao-copilot --limit 1000 --json number,title)

if [ -z "$ISSUES" ] || [ "$ISSUES" = "[]" ]; then
    echo -e "${YELLOW}No taskmaster issues found${NC}"
    exit 0
fi

# Create a temp file for results
TEMP_RESULT=$(mktemp)
echo "0 0" > "$TEMP_RESULT"

# Process each issue
echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
    # Read current counts
    read UPDATED FAILED < "$TEMP_RESULT"
    
    ISSUE_NUMBER=$(echo "$issue" | jq -r '.number')
    ISSUE_TITLE=$(echo "$issue" | jq -r '.title')
    
    # Extract task ID from title [Task X]
    TASK_ID=$(echo "$ISSUE_TITLE" | grep -oE '\[Task [0-9]+\]' | grep -oE '[0-9]+' || echo "")
    
    if [ -z "$TASK_ID" ]; then
        echo -e "${YELLOW}⚠ Issue #$ISSUE_NUMBER: Cannot extract task ID${NC}"
        FAILED=$((FAILED + 1))
        echo "$UPDATED $FAILED" > "$TEMP_RESULT"
        continue
    fi
    
    # Find which tag this task belongs to
    FOUND_TAG=""
    for tag in $TAGS; do
        # Check if task exists in this tag
        TASK_EXISTS=$(cat .taskmaster/tasks/tasks.json | jq -r --arg tag "$tag" --arg id "$TASK_ID" \
            '.[$tag].tasks[] | select(.id == ($id | tonumber)) | .id' 2>/dev/null || echo "")
        
        if [ -n "$TASK_EXISTS" ]; then
            FOUND_TAG="$tag"
            break
        fi
    done
    
    if [ -z "$FOUND_TAG" ]; then
        echo -e "${YELLOW}⚠ Issue #$ISSUE_NUMBER (Task $TASK_ID): Cannot find tag${NC}"
        FAILED=$((FAILED + 1))
        echo "$UPDATED $FAILED" > "$TEMP_RESULT"
        continue
    fi
    
    # Add tag label to issue
    TAG_LABEL="tag:$FOUND_TAG"
    
    gh issue edit "$ISSUE_NUMBER" \
        --repo wysRocket/dao-copilot \
        --add-label "$TAG_LABEL" \
        > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Issue #$ISSUE_NUMBER (Task $TASK_ID): Added label '$TAG_LABEL'${NC}"
        UPDATED=$((UPDATED + 1))
        echo "$UPDATED $FAILED" > "$TEMP_RESULT"
    else
        echo -e "${RED}✗ Issue #$ISSUE_NUMBER (Task $TASK_ID): Failed to add label${NC}"
        FAILED=$((FAILED + 1))
        echo "$UPDATED $FAILED" > "$TEMP_RESULT"
    fi
done

# Read final counts
read UPDATED FAILED < "$TEMP_RESULT"
rm -f "$TEMP_RESULT"

echo -e "\n${CYAN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Label Update Complete! ✨${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}Summary:${NC}"
echo -e "  Issues updated: ${GREEN}$UPDATED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  Issues failed: ${RED}$FAILED${NC}"
fi
echo ""
