# GitHub Projects Quick Reference

Quick commands for syncing Taskmaster with GitHub Projects.

## Setup (One-time)

```bash
# 1. Get GitHub token from: https://github.com/settings/tokens
# 2. Create token with "project" scope
# 3. Set environment variable
export GITHUB_TOKEN=your_token_here

# Or add to .env file
echo "GITHUB_TOKEN=your_token_here" >> .env
```

## Daily Commands

```bash
# Check what's in the project
npm run sync:project:list

# Preview what would be synced
npm run sync:project:sync

# Actually sync tasks
npm run sync:project:sync:live
```

## Common Workflows

### Initial Setup

```bash
# 1. View project structure
npm run sync:project:fetch

# 2. See current items
npm run sync:project:list

# 3. Sync all tasks
npm run sync:project:sync:live
```

### Regular Updates

```bash
# After adding/updating tasks in Taskmaster
task-master list
npm run sync:project:sync:live
```

### Before Major Changes

```bash
# Always preview first
npm run sync:project:sync

# Review the output, then:
npm run sync:project:sync:live
```

## Troubleshooting

### "Authentication Error"

```bash
# Verify token is set
echo $GITHUB_TOKEN

# Regenerate if needed
# Go to: https://github.com/settings/tokens
```

### "No items synced"

```bash
# Check existing items
npm run sync:project:list

# Verify tasks.json exists
ls -la .taskmaster/tasks/tasks.json
```

### "GraphQL Error"

- Verify project number is correct (3)
- Check project owner (wysRocket)
- Ensure project is accessible

## Full Documentation

See [GITHUB_PROJECTS_SYNC.md](./GITHUB_PROJECTS_SYNC.md) for complete documentation.
