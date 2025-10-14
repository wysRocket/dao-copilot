# Fix: GitHub Token Missing Project Write Scope

## The Problem

The GitHub CLI token has `read:project` but needs `project` (full read/write) scope to add items to your GitHub Project.

Error message:

```
Your token has not been granted the required scopes to execute this query.
The 'addProjectV2DraftIssue' field requires one of the following scopes: ['project']
```

## Solution: Re-authenticate with Correct Scopes

### Option 1: Re-auth via GitHub CLI (Recommended)

```bash
# Log out from gh
gh auth logout

# Log in again with project scope
gh auth login --scopes project,repo,workflow

# Follow the prompts to authenticate
```

### Option 2: Manual Token with Correct Scopes

1. Go to: https://github.com/settings/tokens

2. Click "Generate new token (classic)"

3. Select these scopes:

   - ✅ **`project`** (Read and write projects) - **REQUIRED**
   - ✅ `repo` (Full control of repositories)
   - ✅ `workflow` (Update GitHub Actions workflows)
   - ✅ `read:org` (Read organization data)

4. Click "Generate token"

5. Copy the token (starts with `ghp_` or `github_pat_`)

6. Set it as environment variable:

   ```bash
   export GITHUB_TOKEN=your_new_token_here
   ```

7. Or add to `.env` file:
   ```bash
   echo "GITHUB_TOKEN=your_new_token_here" >> .env
   ```

### Option 3: Update Existing Token Scopes

1. Go to: https://github.com/settings/tokens
2. Find your existing token
3. Click "Regenerate token"
4. Add the **`project`** scope (full read/write)
5. Save changes
6. Copy the new token value
7. Update `gh` auth:
   ```bash
   gh auth logout
   gh auth login
   # Paste the new token when prompted
   ```

## After Fixing the Token

Run the sync again:

```bash
# Dry run to preview
bash ./.github/scripts/quick-sync-project.sh

# Live sync to apply changes
bash ./.github/scripts/quick-sync-project.sh --live
```

## Verify Token Scopes

Check what scopes your current token has:

```bash
gh auth status
```

Or check via API:

```bash
curl -H "Authorization: Bearer $(gh auth token)" https://api.github.com/user | jq -r '.scopes'
```

## Why This Happened

`gh auth login` by default only grants minimal scopes. To write to Projects, you need explicit `project` scope, not just `read:project`.

## Quick Fix Commands

```bash
# One-liner to re-auth with correct scopes
gh auth logout && gh auth login --scopes project,repo,workflow,read:org

# Then run sync
bash ./.github/scripts/quick-sync-project.sh --live
```

## Alternative: Use GitHub Issues Instead

If you can't get the project scope working, you can still sync to GitHub Issues (which you already did):

```bash
# This works with standard repo scope
bash ./.github/scripts/sync-taskmaster-github.sh transcription-loss-plan pending
```

Then manually add those issues to your project board via the GitHub UI.
