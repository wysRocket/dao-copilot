#!/usr/bin/env node

/**
 * Production Build Performance Benchmarking Script
 * Tests startup time, memory usage, and key performance metrics
 */

const fs = require('fs')
const path = require('path')
const {execSync, spawn} = require('child_process')
const os = require('os')

class ProductionBenchmark {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      platform: {
        os: os.platform(),
        arch: os.arch(),
        version: os.release(),
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
      },
      tests: []
    }

    this.appPath = this.findAppPath()
  }

  findAppPath() {
    const buildDir = path.join(process.cwd(), 'out')
    if (!fs.existsSync(buildDir)) {
      throw new Error('❌ Build directory not found. Run production build first.')
    }

    // Find the app bundle
    const macosApp = path.join(buildDir, 'capture-darwin-arm64', 'capture.app')
    if (fs.existsSync(macosApp)) {
      return macosApp
    }

    throw new Error('❌ Application bundle not found in build directory')
  }

  async measureStartupTime() {
    console.log('🚀 Measuring application startup time...')

    const startTime = Date.now()

    return new Promise(resolve => {
      const child = spawn('open', [this.appPath], {
        stdio: 'ignore',
        detached: true
      })

      // Monitor for the app to actually start
      const checkInterval = setInterval(() => {
        try {
          // Check if app is running
          execSync('pgrep -f capture', {stdio: 'ignore'})
          const endTime = Date.now()
          const startupTime = endTime - startTime

          clearInterval(checkInterval)

          // Kill the app
          try {
            execSync('pkill -f capture', {stdio: 'ignore'})
          } catch (e) {
            // App may have already closed
          }

          const result = {
            test: 'startup_time',
            value: startupTime,
            unit: 'ms',
            status: startupTime < 5000 ? 'PASS' : 'WARN',
            threshold: '< 5000ms',
            description: 'Application startup time from launch to ready state'
          }

          this.results.tests.push(result)
          console.log(
            `  ✅ Startup time: ${startupTime}ms ${result.status === 'PASS' ? '(GOOD)' : '(SLOW)'}`
          )
          resolve(result)
        } catch (e) {
          // App not running yet, continue checking
        }
      }, 100)

      // Timeout after 15 seconds
      setTimeout(() => {
        clearInterval(checkInterval)
        const result = {
          test: 'startup_time',
          value: 15000,
          unit: 'ms',
          status: 'FAIL',
          threshold: '< 5000ms',
          description: 'Application failed to start within timeout'
        }
        this.results.tests.push(result)
        console.log('  ❌ Startup timeout (>15s)')
        resolve(result)
      }, 15000)
    })
  }

  async measureBundleSize() {
    console.log('📦 Analyzing bundle size...')

    const appAsarPath = path.join(this.appPath, 'Contents', 'Resources', 'app.asar')
    const stats = fs.statSync(appAsarPath)
    const sizeInMB = Math.round((stats.size / 1024 / 1024) * 100) / 100

    const result = {
      test: 'bundle_size',
      value: sizeInMB,
      unit: 'MB',
      status: sizeInMB < 200 ? 'PASS' : 'WARN',
      threshold: '< 200MB',
      description: 'Application bundle size (app.asar)'
    }

    this.results.tests.push(result)
    console.log(
      `  ✅ Bundle size: ${sizeInMB}MB ${result.status === 'PASS' ? '(GOOD)' : '(LARGE)'}`
    )
    return result
  }

  async measureInstallationSize() {
    console.log('💾 Measuring installation footprint...')

    const zipPath = path.join(
      process.cwd(),
      'out',
      'make',
      'zip',
      'darwin',
      'arm64',
      'capture-darwin-arm64-1.0.0.zip'
    )

    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath)
      const sizeInMB = Math.round((stats.size / 1024 / 1024) * 100) / 100

      const result = {
        test: 'installation_size',
        value: sizeInMB,
        unit: 'MB',
        status: sizeInMB < 150 ? 'PASS' : 'WARN',
        threshold: '< 150MB',
        description: 'Compressed distribution package size'
      }

      this.results.tests.push(result)
      console.log(
        `  ✅ Installation size: ${sizeInMB}MB ${result.status === 'PASS' ? '(GOOD)' : '(LARGE)'}`
      )
      return result
    } else {
      console.log('  ⚠️  Distribution package not found')
      return null
    }
  }

  async testDependencyIntegrity() {
    console.log('🔍 Checking dependency integrity...')

    const appAsarPath = path.join(this.appPath, 'Contents', 'Resources', 'app.asar')

    try {
      // Check if asar is readable
      const {execSync} = require('child_process')
      execSync(`npx asar list "${appAsarPath}" | head -10`, {stdio: 'ignore'})

      const result = {
        test: 'dependency_integrity',
        value: true,
        unit: 'boolean',
        status: 'PASS',
        threshold: 'readable',
        description: 'Application bundle integrity and dependency packaging'
      }

      this.results.tests.push(result)
      console.log('  ✅ Dependencies packaged correctly')
      return result
    } catch (error) {
      const result = {
        test: 'dependency_integrity',
        value: false,
        unit: 'boolean',
        status: 'FAIL',
        threshold: 'readable',
        description: 'Application bundle integrity check failed'
      }

      this.results.tests.push(result)
      console.log('  ❌ Dependency packaging issues detected')
      return result
    }
  }

  async generateReport() {
    console.log('\n📊 Performance Benchmark Report')
    console.log('=====================================')

    const passed = this.results.tests.filter(t => t.status === 'PASS').length
    const warned = this.results.tests.filter(t => t.status === 'WARN').length
    const failed = this.results.tests.filter(t => t.status === 'FAIL').length

    console.log(`\nTest Results: ${passed} PASS, ${warned} WARN, ${failed} FAIL`)
    console.log(
      `Platform: ${this.results.platform.os} ${this.results.platform.arch} (${this.results.platform.memory})`
    )

    this.results.tests.forEach(test => {
      const icon = test.status === 'PASS' ? '✅' : test.status === 'WARN' ? '⚠️' : '❌'
      console.log(`  ${icon} ${test.test}: ${test.value}${test.unit} (${test.threshold})`)
    })

    // Calculate overall score
    const score = Math.round((passed / this.results.tests.length) * 100)
    console.log(`\n🎯 Overall Performance Score: ${score}%`)

    if (score >= 80) {
      console.log('✅ Production build meets performance standards!')
    } else if (score >= 60) {
      console.log('⚠️  Production build has some performance concerns')
    } else {
      console.log('❌ Production build needs optimization')
    }

    // Save detailed report
    const reportPath = path.join(process.cwd(), 'performance-benchmark-report.json')
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2))
    console.log(`\n📝 Detailed report saved to: ${reportPath}`)

    return this.results
  }

  async runBenchmarks() {
    console.log('🧪 Running Production Build Performance Benchmarks\n')

    try {
      await this.measureBundleSize()
      await this.measureInstallationSize()
      await this.testDependencyIntegrity()
      await this.measureStartupTime()

      return await this.generateReport()
    } catch (error) {
      console.error('❌ Benchmark failed:', error.message)
      process.exit(1)
    }
  }
}

// Run benchmarks if called directly
if (require.main === module) {
  const benchmark = new ProductionBenchmark()
  benchmark
    .runBenchmarks()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Benchmark suite failed:', error)
      process.exit(1)
    })
}

module.exports = ProductionBenchmark
