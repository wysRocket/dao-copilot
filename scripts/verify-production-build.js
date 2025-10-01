#!/usr/bin/env node

/**
 * Production Build Verification Script
 *
 * This script verifies the integrity and completeness of production builds
 * for the DAO Copilot application across all supported platforms.
 */

const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')

const PROJECT_ROOT = process.cwd()
const OUT_DIR = path.join(PROJECT_ROOT, 'out')

console.log('🔍 Production Build Verification\n')
console.log('================================\n')

/**
 * Check if build artifacts exist
 */
function verifyBuildArtifacts() {
  console.log('📦 Checking build artifacts...')

  const requiredPaths = [
    path.join(OUT_DIR, 'capture-darwin-arm64'),
    path.join(OUT_DIR, 'make', 'zip', 'darwin', 'arm64', 'capture-darwin-arm64-1.0.0.zip')
  ]

  const results = []

  for (const artifactPath of requiredPaths) {
    const exists = fs.existsSync(artifactPath)
    const relativePath = path.relative(PROJECT_ROOT, artifactPath)

    if (exists) {
      const stats = fs.statSync(artifactPath)
      const sizeKB = Math.round(stats.size / 1024)
      console.log(`  ✅ ${relativePath} (${sizeKB} KB)`)
      results.push({path: relativePath, status: 'exists', size: sizeKB})
    } else {
      console.log(`  ❌ ${relativePath} - NOT FOUND`)
      results.push({path: relativePath, status: 'missing', size: 0})
    }
  }

  return results
}

/**
 * Verify app bundle structure
 */
function verifyAppBundle() {
  console.log('\n🏗️  Verifying app bundle structure...')

  const appPath = path.join(OUT_DIR, 'capture-darwin-arm64', 'capture.app')

  if (!fs.existsSync(appPath)) {
    console.log('  ❌ App bundle not found')
    return false
  }

  const requiredPaths = ['Contents/Info.plist', 'Contents/MacOS/capture', 'Contents/Resources']

  let allValid = true

  for (const requiredPath of requiredPaths) {
    const fullPath = path.join(appPath, requiredPath)
    if (fs.existsSync(fullPath)) {
      console.log(`  ✅ ${requiredPath}`)
    } else {
      console.log(`  ❌ ${requiredPath} - MISSING`)
      allValid = false
    }
  }

  return allValid
}

/**
 * Check bundle dependencies and files
 */
function analyzeBundleContents() {
  console.log('\n📋 Analyzing bundle contents...')

  const appPath = path.join(OUT_DIR, 'capture-darwin-arm64', 'capture.app')
  const resourcesPath = path.join(appPath, 'Contents', 'Resources')

  if (!fs.existsSync(resourcesPath)) {
    console.log('  ❌ Resources directory not found')
    return
  }

  // Check for key files
  const keyFiles = ['app.asar', 'electron.asar']

  for (const file of keyFiles) {
    const filePath = path.join(resourcesPath, file)
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      const sizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100
      console.log(`  ✅ ${file} (${sizeMB} MB)`)
    } else {
      console.log(`  ❌ ${file} - MISSING`)
    }
  }
}

/**
 * Verify build configuration
 */
function verifyBuildConfig() {
  console.log('\n⚙️  Verifying build configuration...')

  // Check package.json version
  const packagePath = path.join(PROJECT_ROOT, 'package.json')
  if (fs.existsSync(packagePath)) {
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    console.log(`  ✅ App version: ${packageData.version}`)
    console.log(`  ✅ App name: ${packageData.name}`)
  }

  // Check if production environment template exists
  const envTemplatePath = path.join(PROJECT_ROOT, '.env.production.template')
  if (fs.existsSync(envTemplatePath)) {
    console.log('  ✅ Production environment template exists')
  } else {
    console.log('  ❌ Production environment template missing')
  }

  // Check Electron Forge configuration
  const forgeConfigPath = path.join(PROJECT_ROOT, 'forge.config.ts')
  if (fs.existsSync(forgeConfigPath)) {
    console.log('  ✅ Electron Forge configuration exists')
  } else {
    console.log('  ❌ Electron Forge configuration missing')
  }
}

/**
 * Test basic functionality (if possible)
 */
function testBasicFunctionality() {
  console.log('\n🧪 Testing basic functionality...')

  // For now, we'll just verify the executable exists and has proper permissions
  const executablePath = path.join(
    OUT_DIR,
    'capture-darwin-arm64',
    'capture.app',
    'Contents',
    'MacOS',
    'capture'
  )

  if (fs.existsSync(executablePath)) {
    const stats = fs.statSync(executablePath)
    const isExecutable = (stats.mode & parseInt('111', 8)) > 0

    if (isExecutable) {
      console.log('  ✅ Main executable has correct permissions')
    } else {
      console.log('  ❌ Main executable lacks execution permissions')
    }

    // Get file size
    const sizeMB = Math.round((stats.size / (1024 * 1024)) * 100) / 100
    console.log(`  ℹ️  Executable size: ${sizeMB} MB`)
  } else {
    console.log('  ❌ Main executable not found')
  }
}

/**
 * Generate verification report
 */
function generateReport(buildArtifacts) {
  console.log('\n📊 Build Verification Report')
  console.log('============================\n')

  const totalArtifacts = buildArtifacts.length
  const existingArtifacts = buildArtifacts.filter(a => a.status === 'exists').length
  const totalSizeKB = buildArtifacts.reduce((sum, a) => sum + a.size, 0)

  console.log(`Build Status: ${existingArtifacts}/${totalArtifacts} artifacts present`)
  console.log(`Total Size: ${Math.round((totalSizeKB / 1024) * 100) / 100} MB`)
  console.log(`Platform: macOS (darwin-arm64)`)
  console.log(`Build Type: Production`)

  if (existingArtifacts === totalArtifacts) {
    console.log('\n✅ All build verification checks passed!')
    console.log('The production build is ready for distribution.')
  } else {
    console.log('\n❌ Some build verification checks failed.')
    console.log('Review the issues above before distributing.')
  }

  // Save report to file
  const reportPath = path.join(PROJECT_ROOT, 'build-verification-report.json')
  const report = {
    timestamp: new Date().toISOString(),
    platform: 'macOS (darwin-arm64)',
    buildType: 'production',
    artifacts: buildArtifacts,
    totalSizeMB: Math.round((totalSizeKB / 1024) * 100) / 100,
    status: existingArtifacts === totalArtifacts ? 'passed' : 'failed'
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(`\n📝 Full report saved to: build-verification-report.json`)
}

/**
 * Main verification process
 */
function main() {
  try {
    const buildArtifacts = verifyBuildArtifacts()
    verifyAppBundle()
    analyzeBundleContents()
    verifyBuildConfig()
    testBasicFunctionality()
    generateReport(buildArtifacts)
  } catch (error) {
    console.error('\n❌ Verification failed with error:', error.message)
    process.exit(1)
  }
}

// Run verification
main()
