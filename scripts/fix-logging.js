#!/usr/bin/env node

/**
 * Production logging cleanup script
 * Replaces console.log statements with production-safe logger
 */

const fs = require('fs').promises
const path = require('path')

const replacements = [
  {from: /console\.log\(/g, to: 'logger.log('},
  {from: /console\.debug\(/g, to: 'logger.debug('},
  {from: /console\.info\(/g, to: 'logger.info('},
  {from: /console\.group\(/g, to: 'logger.group('},
  {from: /console\.groupEnd\(/g, to: 'logger.groupEnd('},
  {from: /console\.groupCollapsed\(/g, to: 'logger.groupCollapsed('}
]

async function processFile(filePath) {
  try {
    let content = await fs.readFile(filePath, 'utf8')
    let modified = false

    // Check if logger is already imported
    const hasLoggerImport =
      content.includes('import { logger }') || content.includes('import logger')

    // Apply replacements
    for (const {from, to} of replacements) {
      if (from.test(content)) {
        content = content.replace(from, to)
        modified = true
      }
    }

    // Add logger import if needed and modifications were made
    if (modified && !hasLoggerImport) {
      // Find the last import statement
      const lines = content.split('\n')
      let lastImportIndex = -1

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ') && !lines[i].includes('type ')) {
          lastImportIndex = i
        }
      }

      if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, "import { logger } from '../utils/logger'")
        content = lines.join('\n')
      }
    }

    if (modified) {
      await fs.writeFile(filePath, content, 'utf8')
      console.log(`✅ Updated: ${filePath}`)
      return true
    }

    return false
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message)
    return false
  }
}

async function findTypescriptFiles(dir) {
  const files = []

  try {
    const entries = await fs.readdir(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...(await findTypescriptFiles(fullPath)))
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message)
  }

  return files
}

async function main() {
  const srcDir = path.join(process.cwd(), 'src')
  console.log('🔍 Scanning for TypeScript files with console statements...')

  const files = await findTypescriptFiles(srcDir)
  console.log(`📁 Found ${files.length} TypeScript files`)

  let processedCount = 0
  let modifiedCount = 0

  for (const file of files) {
    const wasModified = await processFile(file)
    processedCount++
    if (wasModified) modifiedCount++
  }

  console.log(`\n📊 Summary:`)
  console.log(`   Files processed: ${processedCount}`)
  console.log(`   Files modified: ${modifiedCount}`)
  console.log(`   Files unchanged: ${processedCount - modifiedCount}`)

  if (modifiedCount > 0) {
    console.log(`\n✅ Successfully updated ${modifiedCount} files with production-safe logging`)
  } else {
    console.log(`\n✨ All files already use production-safe logging`)
  }
}

main().catch(console.error)
