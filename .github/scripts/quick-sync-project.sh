#!/bin/bash
# Quick Sync: Taskmaster Tasks to GitHub Project
# Uses gh CLI token automatically

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
echo -e "${BLUE}Taskmaster → GitHub Project Sync${NC}"
echo -e "${BLUE}=====================================${NC}\n"

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) is not installed${NC}"
    echo -e "${YELLOW}Install with: brew install gh${NC}"
    exit 1
fi

# Check GitHub authentication
if ! gh auth status &> /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ GitHub CLI is not authenticated${NC}"
    echo -e "${YELLOW}Running: gh auth login${NC}\n"
    gh auth login
fi

# Get GitHub token from gh CLI
echo -e "${BLUE}Getting GitHub token...${NC}"
GITHUB_TOKEN=$(gh auth token)

if [ -z "$GITHUB_TOKEN" ]; then
    echo -e "${RED}✗ Failed to get GitHub token${NC}"
    echo -e "${YELLOW}Please run: gh auth login${NC}"
    exit 1
fi

export GITHUB_TOKEN
echo -e "${GREEN}✓ GitHub token obtained${NC}\n"

# Determine sync mode
if [ "$1" = "--live" ] || [ "$1" = "-l" ]; then
    echo -e "${YELLOW}⚡ LIVE MODE: Changes will be applied${NC}\n"
    npm run sync:project:sync:live
else
    echo -e "${BLUE}🔍 DRY RUN MODE: Preview only (use --live to apply changes)${NC}\n"
    npm run sync:project:sync
fi

echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}Sync completed!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "\nView project: ${BLUE}https://github.com/users/wysRocket/projects/3${NC}"
