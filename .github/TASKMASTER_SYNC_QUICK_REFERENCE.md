# Taskmaster GitHub Sync - Quick Reference

## Quick Commands

### Full Sync (Recommended)

```bash
# Sync all tasks from all tags to GitHub
bash .github/scripts/sync-all-tags.sh
```

### Sync Specific Tag

```bash
# Sync only one tag
bash .github/scripts/sync-taskmaster-github.sh <tag-name> pending
```

### Setup New Labels

```bash
# Create labels for any new Taskmaster tags
bash .github/scripts/setup-github-labels.sh
```

### Fix Missing Tag Labels

```bash
# Add tag labels to existing issues
bash .github/scripts/add-tag-labels-to-issues.sh
```

### Sync to Project Board

```bash
# Add all taskmaster issues to project board
bash .github/scripts/sync-all-issues-to-project.sh
```

## Viewing Results

### GitHub Issues

```bash
# List all taskmaster issues
gh issue list --label taskmaster

# Filter by priority
gh issue list --label "priority:high"

# Filter by tag
gh issue list --label "tag:master"

# Filter by tag AND priority
gh issue list --label "tag:master,priority:high"
```

### Project Board

- Web UI: https://github.com/users/wysRocket/projects/3
- CLI: `gh project item-list 3 --owner wysRocket`

### Labels

```bash
# List all labels
gh label list

# List only taskmaster-related
gh label list | grep -E "(priority|taskmaster|tag:)"
```

## Workflow Integration

### When Starting New Feature

1. Create new tag in Taskmaster: `task-master add-tag feature-name`
2. Create tasks: `task-master add-task --prompt="..."`
3. Setup label: `bash .github/scripts/setup-github-labels.sh`
4. Sync to GitHub: `bash .github/scripts/sync-all-tags.sh`

### Daily Development

1. Get next task: `task-master next`
2. View details: `task-master show <id>`
3. Update status: `task-master set-status --id=<id> --status=in-progress`
4. Complete: `task-master set-status --id=<id> --status=done`

### Weekly Sync

```bash
# Sync all new/updated tasks to GitHub
bash .github/scripts/sync-all-tags.sh
```

## Troubleshooting

### Issue Already Exists

- Check Taskmaster task details for GitHub issue reference
- Use `task-master show <id>` to see linked issue

### Missing Labels

```bash
# Recreate all labels
bash .github/scripts/setup-github-labels.sh
```

### Permission Errors

- Verify GitHub token: `gh auth status`
- Required scopes: `repo`, `project`, `read:org`
- Refresh token: `gh auth refresh -s project`

### Duplicate Issues

- Issues are only created for tasks without existing GitHub issue references
- Check task details: `task-master show <id>`
- Look for "GitHub Issue: #XXX" in task details

## Label Color Codes

| Label             | Color            | Meaning               |
| ----------------- | ---------------- | --------------------- |
| `priority:high`   | Red (#d73a4a)    | Urgent tasks          |
| `priority:medium` | Yellow (#fbca04) | Normal priority       |
| `priority:low`    | Green (#0e8a16)  | Low priority          |
| `taskmaster`      | Blue (#1d76db)   | Managed by Taskmaster |
| `tag:*`           | Various          | Source Taskmaster tag |

## Project Board Workflow

1. **Todo Column**: New issues from sync
2. **In Progress**: Tasks actively being worked on
3. **Done**: Completed tasks

Update status either:

- In GitHub Project UI (drag & drop)
- In Taskmaster: `task-master set-status`
- In GitHub Issues: Close issue

## Advanced Queries

### Find High Priority Items by Tag

```bash
gh issue list --label "tag:master,priority:high" --state open
```

### List All Tags

```bash
task-master tags
```

### Show Tag Statistics

```bash
task-master tags --show-metadata
```

### Export Tasks to JSON

```bash
cat .taskmaster/tasks/tasks.json | jq '.master.tasks'
```

## Scripts Location

All sync scripts are in `.github/scripts/`:

- `setup-github-labels.sh` - Create/update labels
- `sync-taskmaster-github.sh` - Sync single tag to issues
- `sync-all-tags.sh` - Sync all tags
- `add-tag-labels-to-issues.sh` - Fix missing tag labels
- `sync-all-issues-to-project.sh` - Sync issues to project board

## GitHub URLs

- **Project Board**: https://github.com/users/wysRocket/projects/3
- **Issues**: https://github.com/wysRocket/dao-copilot/issues?q=label%3Ataskmaster
- **Labels**: https://github.com/wysRocket/dao-copilot/labels

---

**Last Updated**: October 13, 2025
**Maintained By**: DAO Copilot Team
