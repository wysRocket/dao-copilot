#!/bin/bash
# Sync ALL Taskmaster tags to GitHub Issues and Project
# This script iterates through all tags and syncs them

set -e

# Add Homebrew to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  Sync ALL Tags to GitHub Issues & Project ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}\n"

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    exit 1
fi

if ! command -v task-master &> /dev/null; then
    echo -e "${RED}✗ task-master is not available${NC}"
    exit 1
fi

# Get current tag to restore later
ORIGINAL_TAG=$(task-master tags 2>/dev/null | grep "●" | awk '{print $2}' | sed 's/●//g' | tr -d ' ' | head -1)
echo -e "${BLUE}Original tag: ${ORIGINAL_TAG}${NC}\n"

# Get all tags
echo -e "${BLUE}Fetching all tags...${NC}"
TAGS=$(task-master tags 2>/dev/null | tail -n +5 | awk '{print $2}' | sed 's/●//g' | tr -d ' ' | grep -v "^$")

if [ -z "$TAGS" ]; then
    echo -e "${RED}✗ No tags found${NC}"
    exit 1
fi

# Count tags
TAG_COUNT=$(echo "$TAGS" | wc -l | tr -d ' ')
echo -e "${GREEN}Found ${TAG_COUNT} tags to sync${NC}\n"

# Ask for confirmation
echo -e "${YELLOW}Tags to sync:${NC}"
echo "$TAGS" | sed 's/^/  - /'
echo ""
echo -e "${YELLOW}This will:${NC}"
echo "  1. Create GitHub issues for pending tasks in each tag"
echo "  2. Add all tasks to GitHub Project board"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted${NC}"
    exit 0
fi

# Sync each tag
CURRENT=0
TOTAL_ISSUES=0
TOTAL_PROJECT_ITEMS=0

echo -e "\n${CYAN}════════════════════════════════════════════${NC}"
echo -e "${CYAN}Starting sync process...${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}\n"

while IFS= read -r tag; do
    CURRENT=$((CURRENT + 1))
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}[${CURRENT}/${TAG_COUNT}] Processing tag: ${tag}${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    
    # Switch to tag
    echo -e "${CYAN}→ Switching to tag: ${tag}${NC}"
    task-master use-tag "$tag" &>/dev/null || {
        echo -e "${RED}  ✗ Failed to switch to tag${NC}\n"
        continue
    }
    
    # Get task count
    TASK_COUNT=$(task-master list --tag="$tag" 2>/dev/null | grep -c "│" | tail -1 || echo "0")
    echo -e "${GREEN}  ✓ Found tasks in tag${NC}\n"
    
    # Sync to GitHub Issues (pending tasks only)
    echo -e "${CYAN}→ Syncing pending tasks to GitHub Issues...${NC}"
    ISSUES_OUTPUT=$(bash ./.github/scripts/sync-taskmaster-github.sh "$tag" pending 2>&1 || echo "")
    ISSUES_CREATED=$(echo "$ISSUES_OUTPUT" | grep -o "created [0-9]* issue" | grep -o "[0-9]*" || echo "0")
    
    if [ -n "$ISSUES_CREATED" ] && [ "$ISSUES_CREATED" != "0" ]; then
        echo -e "${GREEN}  ✓ Created ${ISSUES_CREATED} GitHub issues${NC}"
        TOTAL_ISSUES=$((TOTAL_ISSUES + ISSUES_CREATED))
    else
        echo -e "${YELLOW}  ⏭  No new issues created (may already exist)${NC}"
    fi
    
    # Sync to GitHub Project
    echo -e "${CYAN}→ Syncing tasks to GitHub Project...${NC}"
    PROJECT_OUTPUT=$(bash ./.github/scripts/quick-sync-project.sh --live 2>&1 || echo "")
    PROJECT_CREATED=$(echo "$PROJECT_OUTPUT" | grep "✅ Created successfully" | wc -l | tr -d ' ')
    
    if [ -n "$PROJECT_CREATED" ] && [ "$PROJECT_CREATED" != "0" ]; then
        echo -e "${GREEN}  ✓ Added ${PROJECT_CREATED} items to project${NC}"
        TOTAL_PROJECT_ITEMS=$((TOTAL_PROJECT_ITEMS + PROJECT_CREATED))
    else
        echo -e "${YELLOW}  ⏭  No new project items created (may already exist)${NC}"
    fi
    
    echo ""
done <<< "$TAGS"

# Restore original tag
echo -e "\n${CYAN}Restoring original tag: ${ORIGINAL_TAG}${NC}"
task-master use-tag "$ORIGINAL_TAG" &>/dev/null

echo -e "\n${CYAN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Sync Complete! ✨${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}Summary:${NC}"
echo -e "  Tags processed: ${TAG_COUNT}"
echo -e "  GitHub issues created: ${TOTAL_ISSUES}"
echo -e "  Project items added: ${TOTAL_PROJECT_ITEMS}"
echo ""
echo -e "${BLUE}View results:${NC}"
echo -e "  Issues: ${CYAN}gh issue list --label taskmaster${NC}"
echo -e "  Project: ${CYAN}https://github.com/users/wysRocket/projects/3${NC}"
echo ""
