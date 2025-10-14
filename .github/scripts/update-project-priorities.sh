#!/bin/bash
# Update priority for all taskmaster items already in the project

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
echo -e "${CYAN}║  Update Priorities in GitHub Project      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}\n"

REPO_OWNER="wysRocket"
REPO_NAME="dao-copilot"
PROJECT_NUMBER="3"

# GitHub Project V2 Field IDs
PROJECT_ID="PVT_kwHOA1vPxc4BEkK6"
PRIORITY_FIELD_ID="PVTSSF_lAHOA1vPxc4BEkK6zg2J8n0"
PRIORITY_P0_ID="79628723"  # high
PRIORITY_P1_ID="0a877460"  # medium
PRIORITY_P2_ID="da944a9c"  # low

echo -e "${BLUE}Fetching all taskmaster issues with priorities...${NC}\n"

UPDATED=0
FAILED=0
SKIPPED=0

# Get all taskmaster issues with their labels
ISSUES=$(gh issue list --label taskmaster --repo "$REPO_OWNER/$REPO_NAME" --limit 1000 --json number,title,labels)
TOTAL=$(echo "$ISSUES" | jq 'length')

echo -e "${GREEN}Found $TOTAL taskmaster issues${NC}\n"

# Get all project items at once for faster lookup
echo -e "${BLUE}Fetching project items...${NC}"
PROJECT_ITEMS=$(gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        items(first: 100) {
          nodes {
            id
            content {
              ... on Issue {
                number
              }
            }
          }
        }
      }
    }
  }' -f owner="$REPO_OWNER" -F number=$PROJECT_NUMBER)

echo -e "${GREEN}✓ Project items loaded${NC}\n"
echo -e "${BLUE}Updating priorities...${NC}\n"

# Process each issue
echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
    ISSUE_NUMBER=$(echo "$issue" | jq -r '.number')
    ISSUE_TITLE=$(echo "$issue" | jq -r '.title' | cut -c1-50)
    
    # Get priority from labels
    PRIORITY=$(echo "$issue" | jq -r '.labels[] | select(.name | startswith("priority:")) | .name' | sed 's/priority://')
    
    if [ -z "$PRIORITY" ]; then
        echo -e "${YELLOW}⏭ #$ISSUE_NUMBER${NC}: No priority label, skipping"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Map priority to option ID
    case "$PRIORITY" in
        high)
            PRIORITY_OPTION_ID="$PRIORITY_P0_ID"
            PRIORITY_NAME="P0"
            ;;
        low)
            PRIORITY_OPTION_ID="$PRIORITY_P2_ID"
            PRIORITY_NAME="P2"
            ;;
        medium)
            PRIORITY_OPTION_ID="$PRIORITY_P1_ID"
            PRIORITY_NAME="P1"
            ;;
        *)
            echo -e "${YELLOW}⏭ #$ISSUE_NUMBER${NC}: Unknown priority '$PRIORITY'"
            SKIPPED=$((SKIPPED + 1))
            continue
            ;;
    esac
    
    # Get item ID from project
    ITEM_ID=$(echo "$PROJECT_ITEMS" | jq -r --arg num "$ISSUE_NUMBER" '.data.user.projectV2.items.nodes[] | select(.content.number == ($num | tonumber)) | .id')
    
    if [ -z "$ITEM_ID" ] || [ "$ITEM_ID" = "null" ]; then
        echo -e "${YELLOW}⏭ #$ISSUE_NUMBER${NC}: Not in project"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Update priority
    RESULT=$(gh api graphql -f query='
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
    
    if echo "$RESULT" | grep -q '"id"'; then
        echo -e "${GREEN}✓ #$ISSUE_NUMBER${NC}: $ISSUE_TITLE → ${CYAN}$PRIORITY_NAME${NC}"
        UPDATED=$((UPDATED + 1))
    else
        echo -e "${RED}✗ #$ISSUE_NUMBER${NC}: Failed to update priority"
        FAILED=$((FAILED + 1))
    fi
done

echo -e "\n${CYAN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✨ Priority Update Complete! ✨${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}\n"

echo -e "${BLUE}Summary:${NC}"
echo -e "  Total issues: ${CYAN}$TOTAL${NC}"
echo -e "  Priorities updated: ${GREEN}$UPDATED${NC}"
echo -e "  Skipped: ${YELLOW}$SKIPPED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "  Failed: ${RED}$FAILED${NC}"
fi
echo -e "\n${BLUE}View project:${NC} ${CYAN}https://github.com/users/$REPO_OWNER/projects/$PROJECT_NUMBER${NC}\n"
