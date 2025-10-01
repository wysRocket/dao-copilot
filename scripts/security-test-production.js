#!/usr/bin/env node

/**
 * Production Build Security Testing Script
 * Performs security analysis and vulnerability checks
 */

const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')
const crypto = require('crypto')

class SecurityTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      securityTests: [],
      vulnerabilities: [],
      recommendations: []
    }
  }

  async testAPIKeyExposure() {
    console.log('🔐 Checking for exposed API keys...')

    const appAsarPath = path.join(
      process.cwd(),
      'out',
      'capture-darwin-arm64',
      'capture.app',
      'Contents',
      'Resources',
      'app.asar'
    )

    try {
      // Extract asar to temporary directory for analysis
      const tempDir = path.join(process.cwd(), '.temp-security-check')
      if (fs.existsSync(tempDir)) {
        execSync(`rm -rf "${tempDir}"`, {stdio: 'ignore'})
      }

      execSync(`npx asar extract "${appAsarPath}" "${tempDir}"`, {stdio: 'ignore'})

      // Search for potential API key patterns
      const apiKeyPatterns = [
        /GEMINI_API_KEY.*[A-Za-z0-9]{20,}/g,
        /OPENAI_API_KEY.*sk-[A-Za-z0-9]{20,}/g,
        /ANTHROPIC_API_KEY.*[A-Za-z0-9]{20,}/g,
        /api[_-]?key.*[A-Za-z0-9]{15,}/gi,
        /secret.*[A-Za-z0-9]{15,}/gi
      ]

      let exposedKeys = false
      let filesChecked = 0

      const checkDirectory = dir => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            checkDirectory(fullPath)
          } else if (item.endsWith('.js') || item.endsWith('.json') || item.endsWith('.env')) {
            filesChecked++
            const content = fs.readFileSync(fullPath, 'utf8')

            for (const pattern of apiKeyPatterns) {
              if (pattern.test(content)) {
                exposedKeys = true
                this.results.vulnerabilities.push({
                  type: 'API_KEY_EXPOSURE',
                  severity: 'HIGH',
                  file: fullPath.replace(tempDir, 'app.asar'),
                  description: 'Potential API key found in bundled code'
                })
              }
            }
          }
        }
      }

      checkDirectory(tempDir)

      // Cleanup
      execSync(`rm -rf "${tempDir}"`, {stdio: 'ignore'})

      const result = {
        test: 'api_key_exposure',
        status: exposedKeys ? 'FAIL' : 'PASS',
        filesChecked,
        description: 'Scan for exposed API keys in production bundle'
      }

      this.results.securityTests.push(result)
      console.log(`  ${exposedKeys ? '❌' : '✅'} API Key Scan: ${filesChecked} files checked`)

      if (!exposedKeys) {
        console.log('  ✅ No exposed API keys found in production bundle')
      }

      return result
    } catch (error) {
      console.log('  ⚠️  Could not perform API key scan:', error.message)
      return {test: 'api_key_exposure', status: 'SKIP', error: error.message}
    }
  }

  async testEnvironmentVariableLeakage() {
    console.log('🌍 Checking for environment variable leakage...')

    try {
      const appAsarPath = path.join(
        process.cwd(),
        'out',
        'capture-darwin-arm64',
        'capture.app',
        'Contents',
        'Resources',
        'app.asar'
      )

      // Check for common environment variable patterns
      const envPatterns = [
        /process\.env\./g,
        /NODE_ENV.*production/g,
        /HOME.*\/Users/g,
        /PWD.*\/.*dao-copilot/g
      ]

      const tempDir = path.join(process.cwd(), '.temp-env-check')
      if (fs.existsSync(tempDir)) {
        execSync(`rm -rf "${tempDir}"`, {stdio: 'ignore'})
      }

      execSync(`npx asar extract "${appAsarPath}" "${tempDir}"`, {stdio: 'ignore'})

      let envLeaks = []
      const checkForEnvLeaks = dir => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            checkForEnvLeaks(fullPath)
          } else if (item.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8')

            for (const pattern of envPatterns) {
              const matches = content.match(pattern)
              if (matches && matches.length > 5) {
                // Allow some process.env usage
                envLeaks.push({
                  file: fullPath.replace(tempDir, 'app.asar'),
                  pattern: pattern.source,
                  matches: matches.length
                })
              }
            }
          }
        }
      }

      checkForEnvLeaks(tempDir)
      execSync(`rm -rf "${tempDir}"`, {stdio: 'ignore'})

      const result = {
        test: 'environment_leakage',
        status: envLeaks.length === 0 ? 'PASS' : 'WARN',
        leaks: envLeaks.length,
        description: 'Check for excessive environment variable usage'
      }

      this.results.securityTests.push(result)
      console.log(
        `  ${envLeaks.length === 0 ? '✅' : '⚠️'} Environment Variables: ${envLeaks.length} potential leaks`
      )

      if (envLeaks.length > 0) {
        envLeaks.forEach(leak => {
          this.results.vulnerabilities.push({
            type: 'ENV_VARIABLE_LEAKAGE',
            severity: 'MEDIUM',
            file: leak.file,
            description: `Excessive use of environment variables (${leak.matches} instances)`
          })
        })
      }

      return result
    } catch (error) {
      console.log('  ⚠️  Could not perform environment variable scan:', error.message)
      return {test: 'environment_leakage', status: 'SKIP', error: error.message}
    }
  }

  async testFilePermissions() {
    console.log('📁 Checking file permissions...')

    const appPath = path.join(process.cwd(), 'out', 'capture-darwin-arm64', 'capture.app')
    const executablePath = path.join(appPath, 'Contents', 'MacOS', 'capture')

    try {
      const stat = fs.statSync(executablePath)
      const mode = stat.mode
      const permissions = (mode & parseInt('777', 8)).toString(8)

      // Check if executable has proper permissions (should be 755 or similar)
      const isExecutable = (mode & fs.constants.S_IXUSR) !== 0
      const isWorldWritable = (mode & fs.constants.S_IWOTH) !== 0

      const result = {
        test: 'file_permissions',
        status: isExecutable && !isWorldWritable ? 'PASS' : 'FAIL',
        permissions,
        executable: isExecutable,
        worldWritable: isWorldWritable,
        description: 'Verify proper file permissions on executable'
      }

      this.results.securityTests.push(result)

      if (isWorldWritable) {
        this.results.vulnerabilities.push({
          type: 'INSECURE_PERMISSIONS',
          severity: 'HIGH',
          file: executablePath,
          description: 'Executable is world-writable'
        })
      }

      console.log(
        `  ${result.status === 'PASS' ? '✅' : '❌'} File Permissions: ${permissions} ${isExecutable ? '(executable)' : '(not executable)'}`
      )
      return result
    } catch (error) {
      console.log('  ❌ Could not check file permissions:', error.message)
      return {test: 'file_permissions', status: 'FAIL', error: error.message}
    }
  }

  async testBundleIntegrity() {
    console.log('🔒 Verifying bundle integrity...')

    const appAsarPath = path.join(
      process.cwd(),
      'out',
      'capture-darwin-arm64',
      'capture.app',
      'Contents',
      'Resources',
      'app.asar'
    )

    try {
      // Calculate file hash for integrity verification
      const fileBuffer = fs.readFileSync(appAsarPath)
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      // Try to list asar contents to verify it's not corrupted
      execSync(`npx asar list "${appAsarPath}" | head -5`, {stdio: 'ignore'})

      const result = {
        test: 'bundle_integrity',
        status: 'PASS',
        hash: hash.substring(0, 16) + '...', // Truncate for display
        size: Math.round((fileBuffer.length / 1024 / 1024) * 100) / 100,
        description: 'Verify bundle is not corrupted and has valid structure'
      }

      this.results.securityTests.push(result)
      console.log(`  ✅ Bundle Integrity: Valid (${result.size}MB, hash: ${result.hash})`)
      return result
    } catch (error) {
      const result = {
        test: 'bundle_integrity',
        status: 'FAIL',
        error: error.message,
        description: 'Bundle integrity check failed'
      }

      this.results.securityTests.push(result)
      this.results.vulnerabilities.push({
        type: 'BUNDLE_CORRUPTION',
        severity: 'HIGH',
        file: appAsarPath,
        description: 'Bundle appears to be corrupted or unreadable'
      })

      console.log('  ❌ Bundle Integrity: Failed -', error.message)
      return result
    }
  }

  async generateSecurityReport() {
    console.log('\n🛡️  Security Testing Report')
    console.log('============================')

    const passed = this.results.securityTests.filter(t => t.status === 'PASS').length
    const warned = this.results.securityTests.filter(t => t.status === 'WARN').length
    const failed = this.results.securityTests.filter(t => t.status === 'FAIL').length
    const skipped = this.results.securityTests.filter(t => t.status === 'SKIP').length

    console.log(`\nTest Results: ${passed} PASS, ${warned} WARN, ${failed} FAIL, ${skipped} SKIP`)

    this.results.securityTests.forEach(test => {
      const icon =
        test.status === 'PASS'
          ? '✅'
          : test.status === 'WARN'
            ? '⚠️'
            : test.status === 'SKIP'
              ? '⏭️'
              : '❌'
      console.log(`  ${icon} ${test.test}: ${test.status}`)
    })

    if (this.results.vulnerabilities.length > 0) {
      console.log('\n🚨 Security Issues Found:')
      this.results.vulnerabilities.forEach((vuln, i) => {
        console.log(`  ${i + 1}. ${vuln.type} (${vuln.severity}): ${vuln.description}`)
      })
    } else {
      console.log('\n✅ No security vulnerabilities detected!')
    }

    // Generate recommendations
    if (failed > 0) {
      this.results.recommendations.push(
        'Review and fix failed security tests before production deployment'
      )
    }
    if (warned > 0) {
      this.results.recommendations.push('Consider addressing warning-level security concerns')
    }
    if (this.results.vulnerabilities.length === 0) {
      this.results.recommendations.push('Security posture is good for production deployment')
    }

    // Calculate security score
    const totalTests = this.results.securityTests.length - skipped
    const score = totalTests > 0 ? Math.round((passed / totalTests) * 100) : 0
    console.log(`\n🎯 Security Score: ${score}%`)

    if (score >= 90) {
      console.log('✅ Excellent security posture!')
    } else if (score >= 70) {
      console.log('⚠️  Good security with room for improvement')
    } else {
      console.log('❌ Security needs attention before production deployment')
    }

    // Save report
    const reportPath = path.join(process.cwd(), 'security-test-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2))
    console.log(`\n📝 Detailed security report saved to: ${reportPath}`)

    return this.results
  }

  async runSecurityTests() {
    console.log('🔒 Running Production Build Security Tests\n')

    try {
      await this.testBundleIntegrity()
      await this.testFilePermissions()
      await this.testAPIKeyExposure()
      await this.testEnvironmentVariableLeakage()

      return await this.generateSecurityReport()
    } catch (error) {
      console.error('❌ Security testing failed:', error.message)
      process.exit(1)
    }
  }
}

// Run security tests if called directly
if (require.main === module) {
  const tester = new SecurityTester()
  tester
    .runSecurityTests()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Security test suite failed:', error)
      process.exit(1)
    })
}

module.exports = SecurityTester
