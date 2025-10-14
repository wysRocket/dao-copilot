#!/bin/bash
# Setup GitHub Labels for Taskmaster Integration
# Run this once to create the necessary labels

set -e

# Add Homebrew to PATH
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}GitHub Labels Setup${NC}"
echo -e "${BLUE}=====================================${NC}\n"

# Check if gh is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    exit 1
fi

echo -e "${BLUE}Creating priority labels...${NC}\n"

# Create or update labels
gh label create "priority:high" --color "d73a4a" --description "High priority task" 2>&1 || \
    gh label edit "priority:high" --color "d73a4a" --description "High priority task" 2>&1 || \
    echo -e "${YELLOW}Label 'priority:high' already exists${NC}"

gh label create "priority:medium" --color "fbca04" --description "Medium priority task" 2>&1 || \
    gh label edit "priority:medium" --color "fbca04" --description "Medium priority task" 2>&1 || \
    echo -e "${YELLOW}Label 'priority:medium' already exists${NC}"

gh label create "priority:low" --color "0e8a16" --description "Low priority task" 2>&1 || \
    gh label edit "priority:low" --color "0e8a16" --description "Low priority task" 2>&1 || \
    echo -e "${YELLOW}Label 'priority:low' already exists${NC}"

gh label create "taskmaster" --color "1d76db" --description "Task managed by Taskmaster" 2>&1 || \
    gh label edit "taskmaster" --color "1d76db" --description "Task managed by Taskmaster" 2>&1 || \
    echo -e "${YELLOW}Label 'taskmaster' already exists${NC}"

echo -e "\n${BLUE}Creating tag labels...${NC}\n"

# Get all tags from Taskmaster and create labels for each
if [ -f ".taskmaster/tasks/tasks.json" ]; then
    TAGS=$(cat .taskmaster/tasks/tasks.json | jq -r 'keys[]' 2>/dev/null || echo "")
    
    if [ -n "$TAGS" ]; then
        while IFS= read -r tag; do
            LABEL_NAME="tag:$tag"
            # Use different colors for different tags (cycle through a palette)
            case $(($(echo -n "$tag" | sum | awk '{print $1}') % 6)) in
                0) COLOR="7057ff" ;; # Purple
                1) COLOR="008672" ;; # Teal
                2) COLOR="e99695" ;; # Pink
                3) COLOR="f9d0c4" ;; # Peach
                4) COLOR="c2e0c6" ;; # Mint
                5) COLOR="bfdadc" ;; # Sky blue
            esac
            
            gh label create "$LABEL_NAME" --color "$COLOR" --description "Tasks from Taskmaster tag: $tag" 2>&1 || \
                gh label edit "$LABEL_NAME" --color "$COLOR" --description "Tasks from Taskmaster tag: $tag" 2>&1 || \
                echo -e "${YELLOW}Label '$LABEL_NAME' already exists${NC}"
        done <<< "$TAGS"
        echo -e "${GREEN}✓ Created labels for all tags${NC}"
    else
        echo -e "${YELLOW}⚠ No tags found in Taskmaster${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Taskmaster tasks.json not found${NC}"
fi

echo -e "\n${GREEN}✓ Labels setup complete!${NC}"
echo -e "\n${BLUE}Available labels:${NC}"
gh label list | grep -E "(priority|taskmaster|tag:)" || echo "No matching labels found"
