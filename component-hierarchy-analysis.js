#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Function to extract imports from a React component file
function extractImports(content) {
  const imports = []
  const importRegex = /import\s+(?:{[^}]*}|\w+|[*]\s+as\s+\w+)\s+from\s+['"`]([^'"`]+)['"`]/g
  let match

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]

    // Filter for relative imports that might be components
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
      imports.push(importPath)
    }
  }

  return imports
}

// Function to extract component usage from JSX content
function extractComponentUsage(content) {
  const components = []

  // Find JSX component usage - looking for components that start with capital letters
  const componentRegex = /<([A-Z][a-zA-Z0-9]*)/g
  let match

  while ((match = componentRegex.exec(content)) !== null) {
    const componentName = match[1]
    if (!components.includes(componentName)) {
      components.push(componentName)
    }
  }

  return components
}

// Function to read and analyze a component file
function analyzeComponent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const imports = extractImports(content)
    const usedComponents = extractComponentUsage(content)

    return {
      filePath,
      imports,
      usedComponents,
      content: content.substring(0, 500) + '...' // First 500 chars for preview
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message)
    return null
  }
}

// Function to find all component files
function findComponentFiles(dir) {
  const files = []

  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir)

    for (const item of items) {
      const itemPath = path.join(currentDir, item)
      const stat = fs.statSync(itemPath)

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        traverse(itemPath)
      } else if (stat.isFile() && (item.endsWith('.tsx') || item.endsWith('.jsx'))) {
        files.push(itemPath)
      }
    }
  }

  traverse(dir)
  return files
}

// Main analysis function
function analyzeComponentHierarchy() {
  const projectRoot = '/Users/mininet/Projects/dao-copilot'
  const srcDir = path.join(projectRoot, 'src')

  console.log('🔍 Analyzing React Component Hierarchy...\n')

  // Find all component files
  const componentFiles = findComponentFiles(srcDir)
  console.log(`Found ${componentFiles.length} React component files:\n`)

  const analysis = {}
  const componentMap = new Map()

  // Analyze each component
  for (const filePath of componentFiles) {
    const componentAnalysis = analyzeComponent(filePath)
    if (componentAnalysis) {
      const relativePath = path.relative(projectRoot, filePath)
      analysis[relativePath] = componentAnalysis

      // Extract component name from file path
      const fileName = path.basename(filePath, path.extname(filePath))
      componentMap.set(fileName, relativePath)
    }
  }

  // Build hierarchy tree
  console.log('📋 Component Hierarchy Analysis:\n')
  console.log('=====================================\n')

  // Start with App.tsx as root
  const rootComponent = 'src/App.tsx'
  if (analysis[rootComponent]) {
    console.log('🏠 ROOT: App.tsx')
    printComponentTree(rootComponent, analysis, componentMap, 1, new Set())
  }

  // Also analyze pages and major components
  console.log('\n📄 PAGE COMPONENTS:')
  console.log('===================\n')

  const pageFiles = componentFiles.filter(f => f.includes('/pages/'))
  for (const pageFile of pageFiles) {
    const relativePath = path.relative(projectRoot, pageFile)
    const pageName = path.basename(pageFile, path.extname(pageFile))
    console.log(`📄 ${pageName}`)
    printComponentTree(relativePath, analysis, componentMap, 1, new Set())
  }

  // Identify potential duplicate components
  console.log('\n🔍 POTENTIAL DUPLICATES:')
  console.log('========================\n')

  const componentNames = new Map()
  for (const filePath of componentFiles) {
    const fileName = path.basename(filePath, path.extname(filePath))
    if (!componentNames.has(fileName)) {
      componentNames.set(fileName, [])
    }
    componentNames.get(fileName).push(path.relative(projectRoot, filePath))
  }

  for (const [name, paths] of componentNames.entries()) {
    if (paths.length > 1) {
      console.log(`⚠️  ${name}:`)
      paths.forEach(p => console.log(`   - ${p}`))
      console.log('')
    }
  }

  // Component usage statistics
  console.log('\n📊 COMPONENT USAGE STATISTICS:')
  console.log('===============================\n')

  const usageCount = new Map()
  for (const [filePath, data] of Object.entries(analysis)) {
    for (const component of data.usedComponents) {
      usageCount.set(component, (usageCount.get(component) || 0) + 1)
    }
  }

  const sortedUsage = Array.from(usageCount.entries()).sort((a, b) => b[1] - a[1])
  console.log('Most used components:')
  sortedUsage.slice(0, 15).forEach(([name, count]) => {
    console.log(`  ${name}: ${count} times`)
  })

  return analysis
}

// Helper function to print component tree
function printComponentTree(componentPath, analysis, componentMap, depth, visited) {
  const indent = '  '.repeat(depth)
  const component = analysis[componentPath]

  if (!component || visited.has(componentPath)) {
    if (visited.has(componentPath)) {
      console.log(`${indent}↩️  [circular reference]`)
    }
    return
  }

  visited.add(componentPath)

  // Print used components
  if (component.usedComponents.length > 0) {
    for (const usedComponent of component.usedComponents) {
      // Try to find the component file
      const componentFile = componentMap.get(usedComponent)
      if (componentFile) {
        console.log(`${indent}├─ ${usedComponent} (${componentFile})`)
        if (depth < 3) {
          // Limit depth to prevent infinite recursion
          printComponentTree(componentFile, analysis, componentMap, depth + 1, new Set(visited))
        }
      } else {
        console.log(`${indent}├─ ${usedComponent} [external/not found]`)
      }
    }
  }

  visited.delete(componentPath)
}

// Run the analysis
if (require.main === module) {
  analyzeComponentHierarchy()
}

module.exports = {analyzeComponentHierarchy}
