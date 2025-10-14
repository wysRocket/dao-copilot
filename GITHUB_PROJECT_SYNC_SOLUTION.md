# GitHub Project Sync - Complete Solution

## Current Situation

✅ **GitHub Issues**: 7+ issues created successfully (some tasks already synced)
❌ **GitHub Project Board**: Empty - needs token with `project` write scope

## The Root Problem

Your GitHub CLI token has these scopes:

- ✅ `read:project` - Can read projects
- ❌ **Missing: `project`** - Cannot write to projects

## Quick Fix (3 Steps)

### Step 1: Re-authenticate with Correct Scopes

Run in your terminal:

```bash
gh auth logout
gh auth login --scopes project,repo,workflow,read:org
```

Follow the authentication prompts.

### Step 2: Verify Token

```bash
gh auth status
# Should show: project, repo, workflow, read:org
```

### Step 3: Sync to GitHub Project

```bash
cd /Users/mininet/Projects/dao-copilot

# Preview what will be synced (dry run)
bash ./.github/scripts/quick-sync-project.sh

# Apply changes (live sync)
bash ./.github/scripts/quick-sync-project.sh --live
```

This will add all 30 tasks from `transcription-loss-plan` to your project board at:
https://github.com/users/wysRocket/projects/3

## What Will Be Synced

All 30 tasks from the `transcription-loss-plan` tag:

**High Priority (5 tasks):**

1. Implement Transcript Lifecycle FSM
2. Develop Persistence Layer with WAL
3. Implement Connection Management
4. Develop Fallback and Replay Mechanism
5. Implement Session and ID Management
6. Implement Error Detection and Recovery

**Medium Priority (9 tasks):** 5. Create Orphan and Gap Detection Worker 6. Implement Deduplication and Merge Engine 7. Implement Comprehensive Telemetry 8. Develop Testing Framework and Chaos Suite 9. Enhance UI Integrity and Status Indicators 10. Implement Configuration and Feature Flags 12. Develop Backpressure and Buffer Management 14. Develop Audio Alignment Verification 15. Implement Feature Flag Rollout

**Plus 15 more cancelled/archived tasks** (Tasks 16-30)

## Alternative: Manual Token Creation

If `gh auth login` doesn't work:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name it: "Taskmaster Project Sync"
4. Select scopes:
   - ✅ **project** (Read and write projects)
   - ✅ repo (Full control of repositories)
   - ✅ workflow (Update GitHub Actions)
   - ✅ read:org (Read organization data)
5. Generate and copy the token
6. Run:
   ```bash
   export GITHUB_TOKEN=your_token_here
   bash ./.github/scripts/quick-sync-project.sh --live
   ```

## Troubleshooting

### Error: "command not found: gh"

Run in a regular terminal window (not VS Code terminal), or:

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
```

### Error: "MODULE_NOT_FOUND"

```bash
npm install @octokit/graphql
```

### Error: "priority:medium not found"

```bash
bash ./.github/scripts/setup-github-labels.sh
```

### Want to sync a different tag?

```bash
# Switch to different tag first
task-master use-tag master

# Then sync
bash ./.github/scripts/quick-sync-project.sh --live
```

## Files Created/Updated

✅ `.github/scripts/quick-sync-project.sh` - Easy sync script
✅ `.github/scripts/sync-taskmaster-github.sh` - Issues sync (updated with PATH fix)
✅ `.github/scripts/update-task-from-issue.sh` - Reverse sync (updated)
✅ `.github/scripts/setup-github-labels.sh` - Label creator
✅ `scripts/github-projects-sync.ts` - Auto-detects current tag
✅ `GITHUB_TOKEN_SCOPE_FIX.md` - Detailed token fix guide
✅ `GITHUB_SYNC_FIX.md` - Quick sync troubleshooting
✅ `GITHUB_SYNC_TROUBLESHOOTING.md` - Complete guide

## Summary Commands

```bash
# Fix token
gh auth logout && gh auth login --scopes project,repo,workflow,read:org

# Sync to project board
bash ./.github/scripts/quick-sync-project.sh --live

# View your project
open https://github.com/users/wysRocket/projects/3

# Sync to issues instead (if project sync fails)
bash ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending
```

## Success Indicators

After successful sync, you should see:

- ✅ 30 draft issues in your GitHub Project
- ✅ Status set to "Ready" or "Backlog"
- ✅ Tasks organized by priority
- ✅ Full task details in descriptions
- ✅ Dependencies listed
- ✅ Subtasks as checkboxes

Your project board will then have all your Taskmaster tasks visible and manageable!
