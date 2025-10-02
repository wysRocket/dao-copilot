# GitHub Projects Synchronization - Quick Start

This repository now includes full GitHub Projects V2 synchronization!

## 🚀 Getting Started (2 minutes)

1. **Get a GitHub Token**

   - Visit: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select the **project** scope
   - Copy your token

2. **Set Your Token**

   ```bash
   export GITHUB_TOKEN=your_token_here
   ```

3. **Run the Demo**
   ```bash
   npm run sync:project:demo
   ```

## 📋 Available Commands

```bash
npm run sync:project:fetch          # View project structure
npm run sync:project:list           # List all items
npm run sync:project:sync           # Dry run preview
npm run sync:project:sync:live      # Actually sync tasks
npm run sync:project:demo           # Interactive demo
npm run sync:project:example        # Code example
```

## 📚 Documentation

- **[Complete Guide](./docs/GITHUB_PROJECTS_SYNC.md)** - Full documentation
- **[Quick Reference](./docs/GITHUB_PROJECTS_QUICK_REF.md)** - Command cheatsheet
- **[Implementation Details](./docs/GITHUB_PROJECTS_IMPLEMENTATION.md)** - Technical details

## ✨ What It Does

Synchronizes your Taskmaster tasks to GitHub Projects:

- Creates draft issues for each task
- Includes full task details, dependencies, subtasks
- Prevents duplicates automatically
- Supports dry-run mode for safety

## 🎯 Example Usage

```bash
# View what's in your project
npm run sync:project:list

# Preview what would be synced
npm run sync:project:sync

# Actually sync the tasks
npm run sync:project:sync:live
```

## 🔄 CI/CD Integration

GitHub Actions workflow included:

- Auto-syncs on tasks.json changes
- Manual trigger available
- Requires `PROJECTS_SYNC_TOKEN` secret

See `.github/workflows/sync-projects.yml` for details.

## 📖 Full Documentation

For complete information, see:

- `docs/GITHUB_PROJECTS_SYNC.md`
- `docs/GITHUB_PROJECTS_QUICK_REF.md`
- `docs/GITHUB_PROJECTS_IMPLEMENTATION.md`

---

**Ready to sync!** 🎉
