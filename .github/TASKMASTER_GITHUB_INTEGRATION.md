# Taskmaster ↔ GitHub Issues Integration Guide

This document explains how to integrate Taskmaster with GitHub Issues for seamless task tracking and project management.

## 🚀 Quick Start

### Prerequisites

1. **Install GitHub CLI**:

   ```bash
   brew install gh
   ```

2. **Authenticate GitHub CLI**:

   ```bash
   gh auth login
   ```

3. **Install jq** (for JSON parsing):

   ```bash
   brew install jq
   ```

4. **Ensure Taskmaster is installed**:
   ```bash
   npm install -g task-master-ai
   # or use npx: npx task-master-ai list
   ```

---

## 📋 Available Integration Methods

### Method 1: Automated Scripts (Recommended)

We provide two bash scripts for bi-directional sync:

#### **Taskmaster → GitHub Issues**

Create GitHub issues from pending Taskmaster tasks:

```bash
# Make script executable
chmod +x .github/scripts/sync-taskmaster-github.sh

# Sync all pending tasks from master tag
.github/scripts/sync-taskmaster-github.sh master pending

# Sync in-progress tasks
.github/scripts/sync-taskmaster-github.sh master in-progress

# Sync from a different tag
.github/scripts/sync-taskmaster-github.sh feature-branch pending
```

**What it does:**

- ✅ Creates one GitHub issue per Taskmaster task
- ✅ Adds `taskmaster` label automatically
- ✅ Includes task details, priority, and metadata
- ✅ Prevents duplicate issues
- ✅ Updates task with issue number reference

#### **GitHub Issues → Taskmaster**

Update task status when issues are closed:

```bash
# Make script executable
chmod +x .github/scripts/update-task-from-issue.sh

# Sync closed issues to tasks
.github/scripts/update-task-from-issue.sh
```

**What it does:**

- ✅ Finds all closed issues with `taskmaster` label
- ✅ Extracts task ID from issue title
- ✅ Marks corresponding task as `done`
- ✅ Adds confirmation comment to issue

---

### Method 2: GitHub Actions (Automated CI/CD)

The workflow at `.github/workflows/taskmaster-issue-sync.yml` provides automated sync:

#### **Automatic Trigger**

- When an issue is **closed** → Task marked as `done`
- When an issue is **reopened** → Task marked as `in-progress`

#### **Manual Trigger**

Run the workflow manually from GitHub Actions tab:

1. Go to **Actions** → **Taskmaster Issue Sync**
2. Click **Run workflow**
3. Choose sync direction:
   - `issue-to-task`: Update tasks from closed issues
   - `task-to-issue`: Create issues from pending tasks

**Requirements:**

- Add API keys to repository secrets:
  - `ANTHROPIC_API_KEY`
  - `PERPLEXITY_API_KEY`
  - `OPENAI_API_KEY`

---

### Method 3: Using Collection Prompts

Use the newly installed prompts for integration:

#### **Create Issues from Implementation Plans**

```bash
# In chat/copilot
@create-github-issues-feature-from-implementation-plan file=path/to/plan.md
```

#### **Create Issues from PRDs**

```bash
# In chat/copilot
@prd
# ... generate PRD
# ... approve PRD
# Respond "Yes" when asked to create GitHub issues
```

---

### Method 4: Manual Integration

For one-off tasks or custom workflows:

#### **Create Issue from Task**

```bash
# Get task details
task-master show 5

# Create issue manually
gh issue create \
  --title "[Task 5] $(task-master show 5 | grep 'Title:' | cut -d':' -f2-)" \
  --body "$(task-master show 5)" \
  --label "taskmaster,enhancement"
```

#### **Update Task from Issue**

```bash
# When closing an issue
gh issue close 123

# Update the corresponding task
task-master set-status --id=5 --status=done
task-master update-task --id=5 --prompt="Completed via GitHub issue #123" --append
```

---

## 🏷️ Naming Conventions

### Issue Titles

Format: `[Task X.Y] Task Title`

Examples:

- `[Task 1] Fix Transcription Source Conflicts`
- `[Task 2.3] Implement WebSocket Routing Logic`

### Git Commits

Format: `type(scope): description (task X.Y, #issue)`

Examples:

```bash
git commit -m "feat: implement JWT auth (task 1.2, #45)"
git commit -m "fix: resolve connection timeout (task 21, closes #161)"
```

### Labels

Automatically applied labels:

- `taskmaster` - All auto-generated issues
- `priority:high` / `priority:medium` / `priority:low` - Based on task priority
- `feature` / `bug` / `chore` - Based on task type (optional)

---

## 🔄 Typical Workflows

### Workflow 1: Starting a New Feature

```bash
# 1. Create tasks from PRD
task-master parse-prd .taskmaster/docs/feature-auth.txt --tag=feature-auth

# 2. Analyze and expand tasks
task-master analyze-complexity --tag=feature-auth
task-master expand --all --research --tag=feature-auth

# 3. Create GitHub issues for tracking
.github/scripts/sync-taskmaster-github.sh feature-auth pending

# 4. Work on tasks
task-master next --tag=feature-auth
task-master set-status --id=1 --status=in-progress

# 5. Complete task and close issue
task-master set-status --id=1 --status=done
gh issue close 123 -c "Completed task 1"
```

### Workflow 2: Team Collaboration

```bash
# Team member creates issue
gh issue create --title "[Task 3] Implement user dashboard"

# You sync the issue to your tasks
.github/scripts/update-task-from-issue.sh

# Work on the task
task-master next
task-master update-subtask --id=3.1 --prompt="Implementation progress..."

# Complete and sync back
task-master set-status --id=3 --status=done
# GitHub Action automatically closes the issue
```

### Workflow 3: Bug Tracking

```bash
# Create bug task from issue
task-master add-task --prompt="Fix memory leak from issue #89" --priority=high

# Reference in commits
git commit -m "fix: resolve memory leak in transcription (task 15, fixes #89)"

# Update both systems
task-master set-status --id=15 --status=done
gh issue close 89
```

---

## 🛠️ Troubleshooting

### GitHub CLI Not Authenticated

```bash
gh auth login
gh auth status
```

### Script Permission Denied

```bash
chmod +x .github/scripts/*.sh
```

### Task-Master Not Found

```bash
# Install globally
npm install -g task-master-ai

# Or use npx
npx task-master-ai list
```

### API Keys Not Configured

For AI-powered Taskmaster operations, ensure API keys are set:

**For CLI:**

```bash
# Add to .env file
echo "ANTHROPIC_API_KEY=your_key" >> .env
echo "OPENAI_API_KEY=your_key" >> .env
```

**For GitHub Actions:**
Add secrets in repository settings:

- Settings → Secrets and variables → Actions → New repository secret

---

## 📊 Monitoring Integration

### View All Taskmaster Issues

```bash
gh issue list --label taskmaster
```

### View Pending Issues

```bash
gh issue list --label taskmaster --state open
```

### View Completed Issues

```bash
gh issue list --label taskmaster --state closed
```

### Check Sync Status

```bash
# Compare tasks vs issues
task-master list --status=pending
gh issue list --label taskmaster --state open
```

---

## 🎯 Best Practices

1. **Consistent Naming**: Always use `[Task X]` format in issue titles
2. **Regular Syncing**: Run sync scripts weekly or after major task updates
3. **Git References**: Always reference both task and issue in commits
4. **Label Organization**: Use additional labels for categorization
5. **Milestone Mapping**: Map task groups to GitHub milestones
6. **Documentation**: Keep task details updated in both systems

---

## 🔗 Related Resources

- [Taskmaster Documentation](.windsurf/rules/taskmaster.md)
- [Development Workflow](.windsurf/rules/dev_workflow.md)
- [GitHub CLI Documentation](https://cli.github.com/manual/)
- [Collection Prompts](.github/prompts/)

---

## 💡 Tips

- Use `--dry-run` mode for testing (add to scripts if needed)
- Create custom labels for your team's workflow
- Set up Slack/Discord webhooks for issue notifications
- Use GitHub Projects to visualize Taskmaster task progress
- Consider creating templates for common task types

---

**Need help?** Check the troubleshooting section or open an issue with the `taskmaster` label.
