# Manual Sync Guide: Add Issues to GitHub Project

Since the automated script is being interrupted, here are the manual commands you can run directly in your terminal.

## Prerequisites

Make sure you have `gh` CLI installed and authenticated:

```bash
gh auth status
```

## Step 1: Get Project and Field IDs

```bash
# Get Project ID
PROJECT_ID=$(gh api graphql -f query='
  query {
    user(login: "wysRocket") {
      projectV2(number: 3) {
        id
      }
    }
  }
' --jq '.data.user.projectV2.id')

echo "Project ID: $PROJECT_ID"
```

## Step 2: Get Status Field Configuration

```bash
# Get Status field ID and "Ready" option ID
gh api graphql -f query='
  query {
    user(login: "wysRocket") {
      projectV2(number: 3) {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
' | jq '.data.user.projectV2.field'

# Store the IDs you see
STATUS_FIELD_ID="<paste-status-field-id>"
READY_OPTION_ID="<paste-ready-option-id>"
```

## Step 3: Get Priority Field Configuration

```bash
# Get Priority field ID and option IDs
gh api graphql -f query='
  query {
    user(login: "wysRocket") {
      projectV2(number: 3) {
        field(name: "Priority") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
' | jq '.data.user.projectV2.field'

# Store the IDs you see
PRIORITY_FIELD_ID="<paste-priority-field-id>"
P1_OPTION_ID="<paste-p1-option-id>"
P2_OPTION_ID="<paste-p2-option-id>"
```

## Step 4: Add Issue #292 (Task 8 - Error Handling)

```bash
# Get issue node ID
ISSUE_292_ID=$(gh api repos/wysRocket/dao-copilot/issues/292 --jq '.node_id')

# Add to project
ITEM_292_ID=$(gh api graphql -f query='
  mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: {
      projectId: $project
      contentId: $content
    }) {
      item {
        id
      }
    }
  }
' -f project="$PROJECT_ID" -f content="$ISSUE_292_ID" --jq '.data.addProjectV2ItemById.item.id')

# Set status to Ready
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_292_ID" -f field="$STATUS_FIELD_ID" -f value="$READY_OPTION_ID"

# Set priority to P1 (medium)
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_292_ID" -f field="$PRIORITY_FIELD_ID" -f value="$P1_OPTION_ID"

echo "✓ Issue #292 added to project"
```

## Step 5: Add Issue #293 (Task 9 - Testing Suite)

```bash
# Get issue node ID
ISSUE_293_ID=$(gh api repos/wysRocket/dao-copilot/issues/293 --jq '.node_id')

# Add to project
ITEM_293_ID=$(gh api graphql -f query='
  mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: {
      projectId: $project
      contentId: $content
    }) {
      item {
        id
      }
    }
  }
' -f project="$PROJECT_ID" -f content="$ISSUE_293_ID" --jq '.data.addProjectV2ItemById.item.id')

# Set status to Ready
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_293_ID" -f field="$STATUS_FIELD_ID" -f value="$READY_OPTION_ID"

# Set priority to P1 (medium)
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_293_ID" -f field="$PRIORITY_FIELD_ID" -f value="$P1_OPTION_ID"

echo "✓ Issue #293 added to project"
```

## Step 6: Add Issue #294 (Task 10 - Advanced Animation)

```bash
# Get issue node ID
ISSUE_294_ID=$(gh api repos/wysRocket/dao-copilot/issues/294 --jq '.node_id')

# Add to project
ITEM_294_ID=$(gh api graphql -f query='
  mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: {
      projectId: $project
      contentId: $content
    }) {
      item {
        id
      }
    }
  }
' -f project="$PROJECT_ID" -f content="$ISSUE_294_ID" --jq '.data.addProjectV2ItemById.item.id')

# Set status to Ready
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_294_ID" -f field="$STATUS_FIELD_ID" -f value="$READY_OPTION_ID"

# Set priority to P2 (low)
gh api graphql -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $value: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project
      itemId: $item
      fieldId: $field
      value: { singleSelectOptionId: $value }
    }) {
      projectV2Item { id }
    }
  }
' -f project="$PROJECT_ID" -f item="$ITEM_294_ID" -f field="$PRIORITY_FIELD_ID" -f value="$P2_OPTION_ID"

echo "✓ Issue #294 added to project"
```

## Verify

After running all commands, view your project:

```bash
open "https://github.com/users/wysRocket/projects/3"
```

Or use the GitHub CLI:

```bash
gh project list --owner wysRocket
gh project item-list 3 --owner wysRocket
```

## Alternative: Use GitHub Web UI

If the CLI continues to have issues, you can manually add items via the web interface:

1. Go to https://github.com/users/wysRocket/projects/3
2. Click "+ Add item" at the bottom of any column
3. Search for issues #292, #293, #294
4. Click each to add them to the project
5. Drag them to the "Ready" column
6. Set Priority field (P1 for #292 and #293, P2 for #294)
