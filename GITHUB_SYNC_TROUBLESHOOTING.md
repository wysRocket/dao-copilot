# GitHub Sync Troubleshooting Guide

## Problem: `gh` Command Not Found in VS Code Terminal

### Why This Happens

VS Code/Copilot spawned terminals use a **non-interactive shell** that doesn't fully load your `.zshrc` configuration, which means:

- ❌ Homebrew paths (`/opt/homebrew/bin`) aren't in PATH
- ❌ Commands like `gh`, `jq`, `task-master` aren't found
- ❌ Environment variables may not be set

### Solutions Applied

#### ✅ **Solution 1: Fixed Sync Scripts (DONE)**

Both sync scripts now include Homebrew paths at the top:

- `.github/scripts/sync-taskmaster-github.sh`
- `.github/scripts/update-task-from-issue.sh`

```bash
# Added to both scripts:
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
```

#### **Solution 2: Run Scripts in Your Regular Terminal (RECOMMENDED)**

Open a **new regular terminal window** (not spawned by Copilot) and run:

```bash
# Navigate to project
cd /Users/mininet/Projects/dao-copilot

# Run sync for pending tasks
./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending

# Or sync in-progress tasks
./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan in-progress
```

#### **Solution 3: Fix VS Code Terminal Settings**

Add to your VS Code `settings.json` (⌘+Shift+P → "Preferences: Open User Settings (JSON)"):

```json
{
  "terminal.integrated.profiles.osx": {
    "zsh": {
      "path": "zsh",
      "args": ["-l"]
    }
  },
  "terminal.integrated.defaultProfile.osx": "zsh",
  "terminal.integrated.inheritEnv": true
}
```

This makes VS Code terminals load as login shells with full PATH.

#### **Solution 4: Fix Your Shell Configuration**

Edit `~/.zshrc` and move PATH setup to the **very top**, before Powerlevel10k instant prompt:

```zsh
# Add this at the VERY TOP of ~/.zshrc
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Then your Powerlevel10k instant prompt...
# Then everything else...
```

### Quick Test

To verify `gh` is working in your current terminal:

```bash
which gh
# Should output: /opt/homebrew/bin/gh or /usr/local/bin/gh

gh --version
# Should output version information
```

### Running the Sync (Step-by-Step)

1. **Open a regular terminal** (outside VS Code or in a manually created terminal tab)

2. **Verify prerequisites:**

   ```bash
   which gh      # Should show path to gh
   which jq      # Should show path to jq
   gh auth status # Should show you're logged in
   ```

3. **If not authenticated:**

   ```bash
   gh auth login
   ```

4. **Run the sync:**

   ```bash
   cd /Users/mininet/Projects/dao-copilot
   ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending
   ```

5. **Verify issues were created:**
   ```bash
   gh issue list --label taskmaster
   ```

### Current Tasks Ready to Sync

You have **15 pending tasks** in `transcription-loss-plan` tag:

- Task 1: Implement Transcript Lifecycle FSM (high priority)
- Task 2: Develop Persistence Layer with WAL (high priority)
- Task 3: Implement Connection Management and Pooling (high priority)
- Task 4: Develop Fallback and Replay Mechanism (high priority)
- Task 5: Create Orphan and Gap Detection Worker (medium priority)
- Task 6: Implement Deduplication and Merge Engine (medium priority)
- Task 7: Implement Comprehensive Telemetry and Monitoring (medium priority)
- Task 8: Develop Testing Framework and Chaos Simulation (medium priority)
- Task 9: Enhance UI Integrity and Status Indicators (medium priority)
- Task 10: Implement Configuration and Feature Flags (medium priority)
- Task 11: Implement Session and ID Management (high priority)
- Task 12: Develop Backpressure and Buffer Management (medium priority)
- Task 13: Implement Error Detection, Classification, and Recovery (high priority)
- Task 14: Develop Audio Alignment and Completeness Validation (medium priority)
- Task 15: Implement Feature Flag Rollout and Activation (medium priority)

### Alternative: GitHub Projects Sync

If you prefer visual board management, use the GitHub Projects sync:

```bash
# Set your GitHub token
export GITHUB_TOKEN=your_github_token_here

# Preview sync (dry run)
npm run sync:project:sync

# Actually sync
npm run sync:project:sync:live
```

This creates draft issues in your GitHub Project board.

### Common Errors and Fixes

#### Error: "command not found: gh"

- **Fix:** Run in a regular terminal window, or apply Solution 3 or 4 above

#### Error: "GitHub CLI is not authenticated"

- **Fix:** Run `gh auth login` and follow prompts

#### Error: "jq is not installed"

- **Fix:** `brew install jq`

#### Error: "task-master is not available"

- **Fix:** `npm install -g task-master-ai`

### Need Help?

If you're still having issues:

1. Check which terminal you're using: `echo $TERM_PROGRAM`
2. Check your PATH: `echo $PATH`
3. Verify installations: `which gh && which jq && which task-master`
4. Try running from a standard macOS Terminal.app window
