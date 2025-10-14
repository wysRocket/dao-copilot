# Quick Fix: GitHub Sync Not Working

## Problem

The sync script was failing with: `could not add label: 'priority:medium' not found`

## Solution

### Step 1: Create the Required Labels (Run Once)

Open your **regular terminal** and run:

```bash
cd /Users/mininet/Projects/dao-copilot

# Run the label setup script
bash ./.github/scripts/setup-github-labels.sh
```

This creates:

- `priority:high` (red)
- `priority:medium` (yellow)
- `priority:low` (green)
- `taskmaster` (blue)

### Step 2: Re-run the Sync

```bash
bash ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending
```

## Alternative: Sync Without Priority Labels

The script has been updated to automatically fall back to creating issues without priority labels if they don't exist. Just re-run the sync command above.

## What Was Fixed

1. ✅ **Added Homebrew PATH** to both sync scripts
2. ✅ **Created label setup script** (`.github/scripts/setup-github-labels.sh`)
3. ✅ **Updated sync script** to gracefully handle missing labels

## Current Status

- **7 issues created successfully** (Tasks 1-4, 8-10)
- **8 issues failed** due to missing priority labels (Tasks 5-7, 11-15)

After running the label setup, re-run the sync to create the remaining 8 issues.

## Manual Label Creation (Alternative)

If the script doesn't work, create labels manually on GitHub:

1. Go to: https://github.com/wysRocket/dao-copilot/labels
2. Click "New label"
3. Create:
   - Name: `priority:high` | Color: `#d73a4a` (red)
   - Name: `priority:medium` | Color: `#fbca04` (yellow)
   - Name: `priority:low` | Color: `#0e8a16` (green)

Then re-run the sync.

## Quick Commands Reference

```bash
# Setup labels (one-time)
bash ./.github/scripts/setup-github-labels.sh

# Sync pending tasks
bash ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending

# Sync in-progress tasks
bash ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan in-progress

# View created issues
gh issue list --label taskmaster

# View all labels
gh label list
```

## Next Steps

1. Run the label setup script
2. Re-run the sync
3. Verify all 15 issues were created: `gh issue list --label taskmaster --state open`
