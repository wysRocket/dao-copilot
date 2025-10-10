#!/usr/bin/env tsx
/**
 * Example: Programmatic Usage of GitHub Projects Sync
 *
 * This example shows how to use the GitHubProjectsSync class
 * in your own TypeScript/JavaScript code.
 */

import {GitHubProjectsSync} from './github-projects-sync'
import * as path from 'path'

async function example() {
  // Initialize the sync client
  const token = process.env.GITHUB_TOKEN || ''
  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required')
    process.exit(1)
  }

  const owner = 'wysRocket'
  const projectNumber = 3
  const sync = new GitHubProjectsSync(token, owner, projectNumber)

  try {
    // Example 1: Fetch project details
    console.log('=== Example 1: Fetching Project Details ===\n')
    const project = await sync.fetchProjectDetails()
    console.log('Project ID:', project.id)
    console.log('Available fields:', project.fields.nodes.length)

    // Example 2: List all project items
    console.log('\n=== Example 2: Listing Project Items ===\n')
    const {items} = await sync.listProjectItems()
    console.log(`Found ${items.length} items in the project`)

    // Example 3: Sync tasks (dry run)
    console.log('\n=== Example 3: Syncing Tasks (Dry Run) ===\n')
    const tasksFile = path.join(process.cwd(), '.taskmaster/tasks/tasks.json')
    await sync.syncTasksToProject(tasksFile, true)

    // Example 4: Sync tasks (live - commented out for safety)
    // Uncomment the following to actually sync:
    /*
    console.log('\n=== Example 4: Syncing Tasks (Live) ===\n');
    await sync.syncTasksToProject(tasksFile, false);
    console.log('✅ Tasks synced successfully!');
    */

    // Example 5: Update project description (dry run)
    console.log('\n=== Example 5: Updating Description (Dry Run) ===\n')
    await sync.updateProjectDescription('DAO Copilot development tasks managed by Taskmaster', true)

    console.log('\n✅ All examples completed successfully!')
    console.log('\nNote: Uncomment Example 4 to actually sync tasks.')
  } catch (error) {
    const err = error as Error
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  example()
}

export {example}
