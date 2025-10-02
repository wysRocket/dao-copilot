# GitHub Projects Synchronization

This guide explains how to synchronize Taskmaster tasks with GitHub Projects V2.

## Prerequisites

1. **GitHub Personal Access Token**: You need a GitHub token with the following permissions:
   - `project` (read/write access to projects)
   - `read:org` (if the project is in an organization)
   - `read:user` (if the project is in a user account)

2. **Create a token**:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select the permissions mentioned above
   - Copy the token

3. **Set the token as an environment variable**:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```

   Or add it to your `.env` file:
   ```bash
   GITHUB_TOKEN=your_token_here
   ```

## Available Commands

### 1. Fetch Project Fields

View the project structure, including fields and their options:

```bash
npm run sync:project:fetch
```

This will display:
- Project title and description
- All fields configured in the project
- Available options for select fields (like Status, Priority, etc.)

### 2. List Project Items

See all existing items in the project:

```bash
npm run sync:project:list
```

This shows:
- All issues, pull requests, and draft issues in the project
- Field values for each item
- Direct links to GitHub items

### 3. Sync Tasks to Project (Dry Run)

Preview what would be synced without making changes:

```bash
npm run sync:project:sync
```

This performs a **dry run** that:
- Analyzes all Taskmaster tasks
- Compares with existing project items
- Shows what would be created
- Makes no actual changes to the project

### 4. Sync Tasks to Project (Live)

Actually sync the tasks to the project:

```bash
npm run sync:project:sync:live
```

This will:
- Create draft issues for each Taskmaster task not already in the project
- Set appropriate field values based on task status and priority
- Link dependencies in task descriptions
- Include all task details, test strategies, and subtasks

### 5. Update Project Description

Update the project's description:

```bash
# Dry run
npm run sync:project update-description "Your new description"

# Live update
npm run sync:project update-description "Your new description" --live
```

## Task Format in GitHub Projects

When synced, each task becomes a draft issue with:

**Title**: `Task {id}: {title}`

**Body**: 
- Description
- Details section (if available)
- Test Strategy (if available)
- Dependencies list (if any)
- Subtasks checklist (if any)
- Status and Priority
- Taskmaster ID reference

## How It Works

### Duplicate Prevention

The sync tool automatically prevents duplicates by:
- Checking if a task title already exists
- Looking for tasks with the same Taskmaster ID
- Skipping tasks that are already in the project

### Status Mapping

Taskmaster statuses map to GitHub Project statuses:
- `pending` → Pending/To Do
- `in-progress` → In Progress
- `done` → Done/Completed
- `blocked` → Blocked
- `deferred` → Backlog

*Note: The exact status names depend on your project's configuration*

### Priority Mapping

If your project has a Priority field:
- `high` → High
- `medium` → Medium  
- `low` → Low

## Configuration

The sync tool uses these defaults:
- **Owner**: `wysRocket`
- **Project Number**: `3`
- **Tasks File**: `.taskmaster/tasks/tasks.json`

To modify these, edit `scripts/github-projects-sync.ts`:

```typescript
const owner = 'wysRocket';        // GitHub username or org
const projectNumber = 3;           // Project number from URL
const tasksFilePath = path.join(process.cwd(), '.taskmaster/tasks/tasks.json');
```

## Troubleshooting

### Authentication Errors

If you see authentication errors:
1. Verify your token has the correct permissions
2. Check that `GITHUB_TOKEN` is set in your environment
3. Try regenerating your token if it's expired

### GraphQL Errors

If you encounter GraphQL errors:
1. Verify the project number is correct
2. Ensure the project is accessible to your token
3. Check that the owner (user/org) is correct

### No Items Synced

If no items are synced:
1. Run `npm run sync:project:list` to see existing items
2. Check if tasks already exist with similar titles
3. Verify the tasks.json file has tasks in the `master` tag

## Examples

### Complete Workflow

```bash
# 1. Check project structure
npm run sync:project:fetch

# 2. See what's already there
npm run sync:project:list

# 3. Preview the sync
npm run sync:project:sync

# 4. Actually sync the tasks
npm run sync:project:sync:live

# 5. Verify everything synced
npm run sync:project:list
```

### Updating Project Info

```bash
# Update description
npm run sync:project update-description "DAO Copilot development tasks managed by Taskmaster" --live
```

## Best Practices

1. **Always dry run first**: Use `sync` without `--live` to preview changes
2. **Regular syncs**: Sync when you add new tasks or update existing ones
3. **Check before syncing**: Run `list` to see what's already in the project
4. **One-way sync**: This tool pushes from Taskmaster to GitHub, not the reverse
5. **Manual updates**: For field values after sync, update directly in GitHub Projects UI

## Advanced Usage

### Programmatic Usage

You can import and use the sync class in your own scripts:

```typescript
import { GitHubProjectsSync } from './scripts/github-projects-sync';

const sync = new GitHubProjectsSync(token, owner, projectNumber);

// Fetch project details
const project = await sync.fetchProjectDetails();

// List items
const { items } = await sync.listProjectItems();

// Sync tasks (dry run)
await sync.syncTasksToProject(tasksFilePath, true);

// Sync tasks (live)
await sync.syncTasksToProject(tasksFilePath, false);
```

## Integration with Taskmaster Workflow

This sync tool integrates with the standard Taskmaster workflow:

1. **Create/Update tasks in Taskmaster** using standard commands:
   ```bash
   task-master list
   task-master add-task --prompt="New feature"
   task-master set-status --id=1 --status=done
   ```

2. **Sync to GitHub Projects**:
   ```bash
   npm run sync:project:sync:live
   ```

3. **Manage in GitHub**: Use GitHub Projects UI for visual board management

4. **Keep Taskmaster as source of truth**: Make task updates in Taskmaster, then re-sync

## Future Enhancements

Planned features:
- Bi-directional sync (GitHub → Taskmaster)
- Automatic sync on task changes
- GitHub Actions integration for CI/CD sync
- Support for multiple project boards
- Custom field mappings configuration file
