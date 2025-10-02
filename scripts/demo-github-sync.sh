#!/bin/bash
# GitHub Projects Sync Demo
# This script demonstrates the synchronization between Taskmaster and GitHub Projects

set -e

echo "=================================================="
echo "GitHub Projects + Taskmaster Sync Demo"
echo "=================================================="
echo ""

# Check if GITHUB_TOKEN is set
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Error: GITHUB_TOKEN is not set"
  echo ""
  echo "To use this demo, you need a GitHub Personal Access Token with 'project' scope."
  echo ""
  echo "Steps to get a token:"
  echo "1. Go to https://github.com/settings/tokens"
  echo "2. Click 'Generate new token (classic)'"
  echo "3. Select the 'project' scope"
  echo "4. Generate and copy the token"
  echo "5. Run: export GITHUB_TOKEN=your_token_here"
  echo ""
  exit 1
fi

echo "✅ GitHub token found"
echo ""

# Step 1: Fetch project details
echo "Step 1: Fetching project structure..."
echo "------------------------------------"
npm run sync:project:fetch
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 2: List existing items
echo "Step 2: Listing existing project items..."
echo "-----------------------------------------"
npm run sync:project:list
echo ""
read -p "Press Enter to continue..."
echo ""

# Step 3: Preview sync (dry run)
echo "Step 3: Previewing task synchronization (dry run)..."
echo "-----------------------------------------------------"
npm run sync:project:sync
echo ""
echo "⚠️  This was a DRY RUN. No changes were made to the project."
echo ""
read -p "Press Enter to continue to live sync, or Ctrl+C to exit..."
echo ""

# Step 4: Actually sync
echo "Step 4: Syncing tasks to project (LIVE)..."
echo "-------------------------------------------"
read -p "Are you sure you want to sync tasks to the project? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npm run sync:project:sync:live
  echo ""
  echo "✅ Synchronization complete!"
else
  echo "❌ Sync cancelled"
fi

echo ""
echo "=================================================="
echo "Demo complete!"
echo "=================================================="
echo ""
echo "To sync again in the future, use:"
echo "  npm run sync:project:sync:live"
echo ""
echo "For more information, see:"
echo "  docs/GITHUB_PROJECTS_SYNC.md"
echo "  docs/GITHUB_PROJECTS_QUICK_REF.md"
echo ""
