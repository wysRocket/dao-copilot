#!/bin/bash
# Sync ALL Taskmaster issues to GitHub Project board
# Uses gh CLI to get all taskmaster issues and add them to the project

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
echo -e "${CYAN}║  Sync All Issues to GitHub Project        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}\n"

REPO_OWNER="wysRocket"
REPO_NAME="dao-copilot"
PROJECT_NUMBER="3"

# GitHub Project V2 Field IDs (from API query)
PRIORITY_FIELD_ID="PVTSSF_lAHOA1vPxc4BEkK6zg2J8n0"
PRIORITY_P0_ID="79628723"  # high
PRIORITY_P1_ID="0a877460"  # medium
PRIORITY_P2_ID="da944a9c"  # low

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    exit 1
fi

# Get GitHub token
GITHUB_TOKEN=$(gh auth token 2>/dev/null)
if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${RED}✗ Failed to get GitHub token${NC}"
    exit 1
fi

# Get project ID
echo -e "${BLUE}Getting project ID...${NC}"
PROJECT_DATA=$(gh project view "$PROJECT_NUMBER" --owner "$REPO_OWNER" --format json 2>/dev/null)
PROJECT_ID=$(echo "$PROJECT_DATA" | jq -r '.id')

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    echo -e "${RED}✗ Failed to get project ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Project ID: $PROJECT_ID${NC}\n"

# Get all taskmaster issues
echo -e "${BLUE}Fetching all taskmaster issues...${NC}"
ISSUES=$(gh issue list --label taskmaster --repo "$REPO_OWNER/$REPO_NAME" --limit 1000 --json number,title,labels,url)

ISSUE_COUNT=$(echo "$ISSUES" | jq 'length')
echo -e "${GREEN}✓ Found $ISSUE_COUNT taskmaster issues${NC}\n"

if [ "$ISSUE_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}No issues to sync${NC}"
    exit 0
fi

# Add each issue to the project
echo -e "${BLUE}Adding issues to project...${NC}\n"

ADDED=0
SKIPPED=0
FAILED=0

echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
    ISSUE_NUMBER=$(echo "$issue" | jq -r '.number')
    ISSUE_TITLE=$(echo "$issue" | jq -r '.title' | cut -c1-60)
    ISSUE_URL=$(echo "$issue" | jq -r '.url')
    
    # Get priority from labels
    PRIORITY=$(echo "$issue" | jq -r '.labels[] | select(.name | startswith("priority:")) | .name' | sed 's/priority://' | head -1)
    if [ -z "$PRIORITY" ]; then
        PRIORITY="medium"
    fi
    
    # Map priority to GitHub Project priority option ID
    case "$PRIORITY" in
        high)
            PRIORITY_OPTION_ID="$PRIORITY_P0_ID"
            ;;
        low)
            PRIORITY_OPTION_ID="$PRIORITY_P2_ID"
            ;;
        *)
            PRIORITY_OPTION_ID="$PRIORITY_P1_ID"
            ;;
    esac
    
    # Get tag from labels
    TAG=$(echo "$issue" | jq -r '.labels[] | select(.name | startswith("tag:")) | .name' | sed 's/tag://' | head -1)
    
    # Add item to project using GraphQL
    RESPONSE=$(gh api graphql -f query='
        mutation($project:ID!, $contentId:ID!) {
          addProjectV2ItemById(input: {
            projectId: $project
            contentId: $contentId
          }) {
            item {
              id
            }
          }
        }' -f project="$PROJECT_ID" -f contentId="$(gh api repos/$REPO_OWNER/$REPO_NAME/issues/$ISSUE_NUMBER --jq '.node_id')" 2>&1)
    
    if echo "$RESPONSE" | grep -q '"id"'; then
        ITEM_ID=$(echo "$RESPONSE" | jq -r '.data.addProjectV2ItemById.item.id')
        
        # Set priority field value using the correct field ID and option ID
        PRIORITY_UPDATE=$(gh api graphql -f query='
            mutation($project:ID!, $item:ID!, $fieldId:ID!, $optionId:String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $project
                itemId: $item
                fieldId: $fieldId
                value: {
                  singleSelectOptionId: $optionId
                }
              }) {
                projectV2Item {
                  id
                }
              }
            }' -f project="$PROJECT_ID" -f item="$ITEM_ID" -f fieldId="$PRIORITY_FIELD_ID" -f optionId="$PRIORITY_OPTION_ID" 2>&1)
        
        if echo "$PRIORITY_UPDATE" | grep -q '"id"'; then
            echo -e "${GREEN}✓ #$ISSUE_NUMBER${NC}: $ISSUE_TITLE ${YELLOW}[$TAG] [P$PRIORITY]${NC}"
        else
            echo -e "${GREEN}✓ #$ISSUE_NUMBER${NC}: $ISSUE_TITLE ${YELLOW}[$TAG]${NC} ${RED}(priority update failed)${NC}"
        fi
        ADDED=$((ADDED + 1))
    elif echo "$RESPONSE" | grep -q "already exists"; then
        echo -e "${BLUE}⏭ #$ISSUE_NUMBER${NC}: Already in project"
        SKIPPED=$((SKIPPED + 1))
    else
        echo -e "${RED}✗ #$ISSUE_NUMBER${NC}: Failed to add"
        FAILED=$((FAILED + 1))
    fi
done

echo -e "\n${CYAN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Project Sync Complete! ✨${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}Summary:${NC}"
echo -e "  Total issues: ${CYAN}$ISSUE_COUNT${NC}"
echo -e "  Added to project: ${GREEN}$ADDED${NC}"
echo -e "  Already in project: ${BLUE}$SKIPPED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  Failed: ${RED}$FAILED${NC}"
fi
echo -e "\n${BLUE}View project:${NC} ${CYAN}https://github.com/users/$REPO_OWNER/projects/$PROJECT_NUMBER${NC}\n"
