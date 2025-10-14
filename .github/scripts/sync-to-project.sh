#!/bin/bash

# Sync Taskmaster tasks to GitHub Project
# This script adds issues to Project #3 and sets their status/priority

set -e

OWNER="wysRocket"
REPO="dao-copilot"
PROJECT_NUMBER=3

# Color output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Syncing Taskmaster tasks to GitHub Project #${PROJECT_NUMBER}${NC}\n"

# Get project ID
echo "Getting project ID..."
PROJECT_ID=$(gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        id
      }
    }
  }
' -f owner="$OWNER" -F number=$PROJECT_NUMBER --jq '.data.user.projectV2.id')

if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}❌ Failed to get project ID${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Project ID: $PROJECT_ID${NC}\n"

# Get Status field ID and option IDs
echo "Getting Status field configuration..."
STATUS_FIELD=$(gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
' -f owner="$OWNER" -F number=$PROJECT_NUMBER)

STATUS_FIELD_ID=$(echo "$STATUS_FIELD" | jq -r '.data.user.projectV2.field.id')
READY_OPTION_ID=$(echo "$STATUS_FIELD" | jq -r '.data.user.projectV2.field.options[] | select(.name == "Ready") | .id')

echo -e "${GREEN}✓ Status field ID: $STATUS_FIELD_ID${NC}"
echo -e "${GREEN}✓ Ready option ID: $READY_OPTION_ID${NC}\n"

# Get Priority field ID and option IDs
echo "Getting Priority field configuration..."
PRIORITY_FIELD=$(gh api graphql -f query='
  query($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        field(name: "Priority") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
' -f owner="$OWNER" -F number=$PROJECT_NUMBER)

PRIORITY_FIELD_ID=$(echo "$PRIORITY_FIELD" | jq -r '.data.user.projectV2.field.id')
P1_OPTION_ID=$(echo "$PRIORITY_FIELD" | jq -r '.data.user.projectV2.field.options[] | select(.name == "P1") | .id')
P2_OPTION_ID=$(echo "$PRIORITY_FIELD" | jq -r '.data.user.projectV2.field.options[] | select(.name == "P2") | .id')

echo -e "${GREEN}✓ Priority field ID: $PRIORITY_FIELD_ID${NC}"
echo -e "${GREEN}✓ P1 option ID: $P1_OPTION_ID${NC}"
echo -e "${GREEN}✓ P2 option ID: $P2_OPTION_ID${NC}\n"

# Function to add issue to project
add_issue_to_project() {
  local issue_number=$1
  local task_title=$2
  local priority_id=$3
  
  echo -e "${BLUE}Adding Issue #${issue_number}: ${task_title}${NC}"
  
  # Get issue node ID
  ISSUE_ID=$(gh api "repos/$OWNER/$REPO/issues/$issue_number" --jq '.node_id')
  
  if [ -z "$ISSUE_ID" ]; then
    echo -e "${RED}  ❌ Failed to get issue ID${NC}\n"
    return 1
  fi
  
  # Add issue to project
  ITEM_ID=$(gh api graphql -f query='
    mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: {
        projectId: $project
        contentId: $content
      }) {
        item {
          id
        }
      }
    }
  ' -f project="$PROJECT_ID" -f content="$ISSUE_ID" --jq '.data.addProjectV2ItemById.item.id')
  
  if [ -z "$ITEM_ID" ]; then
    echo -e "${YELLOW}  ⚠️  Issue may already be in project${NC}\n"
    return 0
  fi
  
  echo -e "${GREEN}  ✓ Added to project${NC}"
  
  # Set status to "Ready"
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project
        itemId: $item
        fieldId: $field
        value: { 
          singleSelectOptionId: $value
        }
      }) {
        projectV2Item {
          id
        }
      }
    }
  ' -f project="$PROJECT_ID" -f item="$ITEM_ID" -f field="$STATUS_FIELD_ID" -f value="$READY_OPTION_ID" > /dev/null
  
  echo -e "${GREEN}  ✓ Status set to Ready${NC}"
  
  # Set priority
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project
        itemId: $item
        fieldId: $field
        value: { 
          singleSelectOptionId: $value
        }
      }) {
        projectV2Item {
          id
        }
      }
    }
  ' -f project="$PROJECT_ID" -f item="$ITEM_ID" -f field="$PRIORITY_FIELD_ID" -f value="$priority_id" > /dev/null
  
  local priority_name="P1"
  [ "$priority_id" = "$P2_OPTION_ID" ] && priority_name="P2"
  
  echo -e "${GREEN}  ✓ Priority set to ${priority_name}${NC}\n"
}

# Sync the three pending tasks
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Syncing pending tasks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Task 8: Error Handling (medium priority = P1)
add_issue_to_project 292 "Implement Error Handling and Fallback Mechanisms" "$P1_OPTION_ID"

# Task 9: Testing Suite (medium priority = P1)
add_issue_to_project 293 "Create Comprehensive Testing Suite" "$P1_OPTION_ID"

# Task 10: Advanced Animation (low priority = P2)
add_issue_to_project 294 "Implement Advanced Animation Features" "$P2_OPTION_ID"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Sync complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

echo -e "View your project board: ${BLUE}https://github.com/users/${OWNER}/projects/${PROJECT_NUMBER}${NC}"
