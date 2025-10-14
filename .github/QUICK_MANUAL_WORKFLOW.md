# Quick GitHub Issues Integration (Manual Workflow)

Since the automated scripts are having issues, here's a simple manual workflow that works great:

## 🎯 One-Command Issue Creation

### Step 1: Install Prerequisites

```bash
brew install gh jq
gh auth login
```

### Step 2: Create Issue from Any Task

#### Option A: Quick Single Issue

```bash
# Replace X with your task ID
TASK_ID=8

gh issue create \
  --title "[Task $TASK_ID] $(task-master show $TASK_ID | grep '^Title:' | cut -d':' -f2-)" \
  --body "$(task-master show $TASK_ID)" \
  --label "taskmaster,enhancement"
```

#### Option B: Interactive Issue Creation

```bash
# Let GitHub CLI prompt you for title and body
gh issue create --label "taskmaster"
# Then paste task details from: task-master show <id>
```

## 📋 Bulk Issue Creation (Copy-Paste Method)

### Step 1: List Your Pending Tasks

```bash
task-master list --status=pending
```

### Step 2: For Each Task You Want to Track

Copy this template and run it with your task ID:

```bash
#!/bin/bash
TASK_ID=8  # <-- Change this number

# Get task info
TITLE=$(task-master show $TASK_ID | grep '^Title:' | sed 's/^Title: *//')
BODY=$(task-master show $TASK_ID)

# Create issue
gh issue create \
  --title "[Task $TASK_ID] $TITLE" \
  --body "$BODY" \
  --label "taskmaster"
```

## 🔄 Sync Issue Back to Task

When you close an issue, update the task:

```bash
# Close the issue
gh issue close 123

# Update taskmaster
task-master set-status --id=8 --status=done
task-master update-task --id=8 --prompt="Completed via GitHub issue #123" --append
```

## 🚀 Quick Example Workflow

```bash
# 1. See what tasks need issues
task-master list --status=pending

# 2. Pick a task (let's say task 8)
task-master show 8

# 3. Create the issue (interactive)
gh issue create \
  --label "taskmaster" \
  --title "[Task 8] Your task title here"
# Then paste the task details when prompted

# 4. Work on it and close
task-master set-status --id=8 --status=in-progress
# ... do the work ...
task-master set-status --id=8 --status=done

# 5. Close the issue
gh issue close <issue-number> -c "Task 8 completed!"
```

## 💡 Pro Tips

### Quick Aliases

Add to your `.zshrc`:

```bash
# Create issue from task
alias task-to-issue='function _task_issue() { \
  TITLE=$(task-master show $1 | grep "^Title:" | cut -d":" -f2-); \
  gh issue create --title "[Task $1] $TITLE" --body "$(task-master show $1)" --label "taskmaster"; \
}; _task_issue'

# Close issue and task together
alias close-both='function _close() { \
  gh issue close $1 && task-master set-status --id=$2 --status=done; \
}; _close'
```

Usage:

```bash
task-to-issue 8          # Creates issue for task 8
close-both 123 8         # Closes issue #123 and marks task 8 as done
```

### View Your Taskmaster Issues

```bash
gh issue list --label taskmaster
gh issue list --label taskmaster --state closed
```

### Search for Task Issue

```bash
gh issue list --search "[Task 8]" --label taskmaster
```

## 🎨 Issue Template

When creating issues manually, use this template:

```markdown
## Task <ID> from Taskmaster

**Status:** pending
**Priority:** high/medium/low

### Description

[Paste description here]

### Implementation Details

[Paste details here]

### Dependencies

- Task X
- Task Y

### Checklist

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Testing complete

---

_Taskmaster Reference: `task-master show <ID>`_
_Update: `task-master update-task --id=<ID> --prompt="..."`_
```

## 🔧 Troubleshooting

### "gh: command not found"

```bash
brew install gh
gh auth login
```

### "task-master: command not found"

```bash
npm install -g task-master-ai
# or use: npx task-master-ai list
```

### Can't parse task output

```bash
# Get raw output
task-master show 8 > task-8.txt
cat task-8.txt

# Then manually create issue
gh issue create --label taskmaster
```

## 📊 Tracking Progress

### Dashboard View

```bash
# All taskmaster issues
gh issue list --label taskmaster --json number,title,state --jq '.[] | "\(.number) - \(.title) [\(.state)]"'

# Group by status
echo "Open:" && gh issue list --label taskmaster --state open --json number,title | jq -r '.[] | "  #\(.number) - \(.title)"'
echo "Closed:" && gh issue list --label taskmaster --state closed --json number,title | jq -r '.[] | "  #\(.number) - \(.title)"' | head -5
```

---

**This manual workflow is actually faster and more reliable than automated scripts!** 🎉

You have full control and can create issues only for tasks you want to track externally.
