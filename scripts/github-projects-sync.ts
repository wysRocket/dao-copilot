#!/usr/bin/env tsx
/**
 * GitHub Projects Synchronization Script
 *
 * Synchronizes Taskmaster tasks with GitHub Projects V2
 * Usage: tsx scripts/github-projects-sync.ts [command] [options]
 */

import {graphql} from '@octokit/graphql'
import * as fs from 'fs'
import * as path from 'path'

interface TaskmasterTask {
  id: number
  title: string
  description: string
  status: string
  priority?: string
  dependencies?: number[]
  details?: string
  testStrategy?: string
  subtasks?: TaskmasterTask[]
}

interface TaskmasterData {
  master: {
    tasks: TaskmasterTask[]
  }
  [key: string]: unknown
}

interface ProjectField {
  id: string
  name: string
  dataType: string
  options?: Array<{id: string; name: string}>
}

interface ProjectItem {
  id: string
  content?: {
    title: string
    url?: string
  }
  fieldValues: {
    nodes: Array<{
      field: {name: string}
      name?: string
      text?: string
    }>
  }
}

interface GraphQLProject {
  id: string
  title: string
  shortDescription?: string
  readme?: string
  fields: {
    nodes: ProjectField[]
  }
}

interface GraphQLUserResponse {
  user: {
    projectV2: GraphQLProject
  }
}

interface GraphQLProjectItem {
  id: string
  content?: {
    title: string
    url?: string
    number?: number
  }
  fieldValues: {
    nodes: Array<{
      text?: string
      name?: string
      field: {
        name: string
      }
    }>
  }
}

interface GraphQLItemsResponse {
  user: {
    projectV2: {
      id: string
      items: {
        nodes: GraphQLProjectItem[]
      }
    }
  }
}

interface GraphQLMutationResponse {
  addProjectV2DraftIssue: {
    projectItem: {
      id: string
    }
  }
}

class GitHubProjectsSync {
  private graphqlWithAuth: typeof graphql
  private projectNumber: number
  private owner: string

  constructor(token: string, owner: string, projectNumber: number) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`
      }
    })
    this.owner = owner
    this.projectNumber = projectNumber
  }

  /**
   * Fetch project details including fields and columns
   */
  async fetchProjectDetails() {
    const query = `
      query($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            title
            shortDescription
            readme
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `

    try {
      const result = (await this.graphqlWithAuth(query, {
        owner: this.owner,
        number: this.projectNumber
      })) as GraphQLUserResponse

      const project = result.user.projectV2

      console.log('\n📋 Project Details:')
      console.log(`   Title: ${project.title}`)
      console.log(`   Description: ${project.shortDescription || 'None'}`)
      console.log(`   ID: ${project.id}`)

      console.log('\n📊 Project Fields:')
      project.fields.nodes.forEach((field: ProjectField) => {
        console.log(`   - ${field.name} (${field.dataType})`)
        if (field.options) {
          field.options.forEach(opt => {
            console.log(`     • ${opt.name}`)
          })
        }
      })

      return project
    } catch (error) {
      const err = error as Error & {errors?: unknown[]}
      console.error('❌ Error fetching project details:', err.message)
      if (err.errors) {
        console.error('GraphQL Errors:', JSON.stringify(err.errors, null, 2))
      }
      throw error
    }
  }

  /**
   * List existing items in the project
   */
  async listProjectItems() {
    const query = `
      query($owner: String!, $number: Int!) {
        user(login: $owner) {
          projectV2(number: $number) {
            id
            items(first: 100) {
              nodes {
                id
                content {
                  ... on Issue {
                    title
                    url
                    number
                  }
                  ... on PullRequest {
                    title
                    url
                    number
                  }
                  ... on DraftIssue {
                    title
                  }
                }
                fieldValues(first: 10) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      text
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    try {
      const result = (await this.graphqlWithAuth(query, {
        owner: this.owner,
        number: this.projectNumber
      })) as GraphQLItemsResponse

      const items = result.user.projectV2.items.nodes

      console.log(`\n📝 Project Items (${items.length} total):`)
      items.forEach((item: ProjectItem) => {
        const title = item.content?.title || 'Draft Item'
        console.log(`\n   - ${title}`)
        if (item.content?.url) {
          console.log(`     URL: ${item.content.url}`)
        }

        item.fieldValues.nodes.forEach(fieldValue => {
          const fieldName = fieldValue.field.name
          const value = fieldValue.name || fieldValue.text || 'N/A'
          console.log(`     ${fieldName}: ${value}`)
        })
      })

      return {projectId: result.user.projectV2.id, items}
    } catch (error) {
      const err = error as Error & {errors?: unknown[]}
      console.error('❌ Error listing project items:', err.message)
      if (err.errors) {
        console.error('GraphQL Errors:', JSON.stringify(err.errors, null, 2))
      }
      throw error
    }
  }

  /**
   * Sync Taskmaster tasks to GitHub Project
   */
  async syncTasksToProject(tasksFilePath: string, dryRun: boolean = true) {
    console.log('\n🔄 Starting task synchronization...')
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)

    // Load Taskmaster tasks
    const tasksData = JSON.parse(fs.readFileSync(tasksFilePath, 'utf-8')) as TaskmasterData
    const tasks = tasksData.master?.tasks || []

    console.log(`\n📚 Loaded ${tasks.length} tasks from Taskmaster`)

    // Get project details
    const project = await this.fetchProjectDetails()
    const projectId = project.id

    // Get existing items
    const {items: existingItems} = await this.listProjectItems()

    console.log('\n🔄 Synchronization Summary:')
    let newItemsCount = 0
    let skippedCount = 0

    for (const task of tasks) {
      // Check if task already exists in project
      const existingItem = existingItems.find(
        (item: ProjectItem) =>
          item.content?.title?.includes(`Task ${task.id}:`) || item.content?.title === task.title
      )

      if (existingItem) {
        console.log(`   ⏭️  Skipping Task ${task.id}: Already exists in project`)
        skippedCount++
        continue
      }

      const taskTitle = `Task ${task.id}: ${task.title}`
      const taskBody = this.formatTaskDescription(task)

      console.log(`   ➕ Would add: ${taskTitle}`)
      newItemsCount++

      if (!dryRun) {
        try {
          await this.createDraftIssueInProject(projectId, taskTitle, taskBody)
          console.log(`      ✅ Created successfully`)
        } catch (error) {
          const err = error as Error
          console.log(`      ❌ Failed: ${err.message}`)
        }
      }
    }

    console.log('\n📊 Synchronization Results:')
    console.log(`   New items to add: ${newItemsCount}`)
    console.log(`   Skipped (existing): ${skippedCount}`)
    console.log(`   Total tasks: ${tasks.length}`)

    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.')
      console.log('   Run with --live flag to apply changes.')
    }
  }

  /**
   * Create a draft issue in the project
   */
  private async createDraftIssueInProject(projectId: string, title: string, body: string) {
    const mutation = `
      mutation($projectId: ID!, $title: String!, $body: String!) {
        addProjectV2DraftIssue(input: {
          projectId: $projectId
          title: $title
          body: $body
        }) {
          projectItem {
            id
          }
        }
      }
    `

    const result = (await this.graphqlWithAuth(mutation, {
      projectId,
      title,
      body
    })) as GraphQLMutationResponse

    return result.addProjectV2DraftIssue.projectItem.id
  }

  /**
   * Format task description for GitHub
   */
  private formatTaskDescription(task: TaskmasterTask): string {
    let body = `## Description\n\n${task.description}\n\n`

    if (task.details) {
      body += `## Details\n\n${task.details}\n\n`
    }

    if (task.testStrategy) {
      body += `## Test Strategy\n\n${task.testStrategy}\n\n`
    }

    if (task.dependencies && task.dependencies.length > 0) {
      body += `## Dependencies\n\n`
      task.dependencies.forEach(depId => {
        body += `- Task ${depId}\n`
      })
      body += '\n'
    }

    if (task.subtasks && task.subtasks.length > 0) {
      body += `## Subtasks\n\n`
      task.subtasks.forEach(subtask => {
        const checked = subtask.status === 'done' ? 'x' : ' '
        body += `- [${checked}] ${subtask.title}\n`
      })
    }

    body += `\n---\n`
    body += `**Status:** ${task.status}\n`
    if (task.priority) {
      body += `**Priority:** ${task.priority}\n`
    }
    body += `**Taskmaster ID:** ${task.id}\n`

    return body
  }

  /**
   * Update project description
   */
  async updateProjectDescription(description: string, dryRun: boolean = true) {
    console.log('\n📝 Updating project description...')
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)

    const project = await this.fetchProjectDetails()
    const projectId = project.id

    console.log(`\n   New description: ${description}`)

    if (!dryRun) {
      const mutation = `
        mutation($projectId: ID!, $description: String!) {
          updateProjectV2(input: {
            projectId: $projectId
            shortDescription: $description
          }) {
            projectV2 {
              id
              shortDescription
            }
          }
        }
      `

      try {
        await this.graphqlWithAuth(mutation, {
          projectId,
          description
        })
        console.log('   ✅ Description updated successfully')
      } catch (error) {
        const err = error as Error
        console.error('   ❌ Error updating description:', err.message)
        throw error
      }
    } else {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.')
      console.log('   Run with --live flag to apply changes.')
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  // Load environment variables
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (!token) {
    console.error('❌ Error: GITHUB_TOKEN or GH_TOKEN environment variable is required')
    console.error('   Set it with: export GITHUB_TOKEN=your_token_here')
    process.exit(1)
  }

  const owner = 'wysRocket'
  const projectNumber = 3
  const tasksFilePath = path.join(process.cwd(), '.taskmaster/tasks/tasks.json')

  const sync = new GitHubProjectsSync(token, owner, projectNumber)

  const dryRun = !args.includes('--live')

  try {
    switch (command) {
      case 'fetch':
      case 'fields':
        await sync.fetchProjectDetails()
        break

      case 'list':
      case 'items':
        await sync.listProjectItems()
        break

      case 'sync':
        await sync.syncTasksToProject(tasksFilePath, dryRun)
        break

      case 'update-description': {
        const description = args[1]
        if (!description) {
          console.error('❌ Error: Description is required')
          console.error(
            '   Usage: npm run sync:project update-description "Your description" [--live]'
          )
          process.exit(1)
        }
        await sync.updateProjectDescription(description, dryRun)
        break
      }

      default:
        console.log('GitHub Projects Sync Tool')
        console.log('\nUsage: npm run sync:project <command> [options]')
        console.log('\nCommands:')
        console.log('  fetch, fields        - Fetch project fields and columns')
        console.log('  list, items          - List existing items in the project')
        console.log(
          '  sync                 - Sync Taskmaster tasks to project (dry run by default)'
        )
        console.log('  update-description   - Update project description')
        console.log('\nOptions:')
        console.log('  --live               - Apply changes (default is dry run)')
        console.log('\nExamples:')
        console.log('  npm run sync:project fetch')
        console.log('  npm run sync:project list')
        console.log('  npm run sync:project sync')
        console.log('  npm run sync:project sync --live')
        console.log('  npm run sync:project update-description "New description" --live')
        console.log('\nEnvironment:')
        console.log('  GITHUB_TOKEN - Required GitHub personal access token')
        console.log('                 Must have project read/write permissions')
    }
  } catch (error) {
    const err = error as Error
    console.error('\n❌ Fatal error:', err.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

export {GitHubProjectsSync}
