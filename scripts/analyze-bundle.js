#!/usr/bin/env node

/**
 * Bundle Analyzer Script for Production Builds
 * Analyzes build output and provides optimization recommendations
 */

const fs = require('fs')
const path = require('path')
const {execSync} = require('child_process')

class BundleAnalyzer {
  constructor() {
    this.buildDir = path.join(process.cwd(), '.vite', 'build')
    this.outDir = path.join(process.cwd(), 'out')
    this.results = {
      chunks: [],
      totalSize: 0,
      recommendations: []
    }
  }

  analyze() {
    console.log('🔍 Analyzing production bundle...\n')

    try {
      this.analyzeChunks()
      this.analyzeAssets()
      this.generateReport()
      this.provideRecommendations()
    } catch (error) {
      console.error('❌ Bundle analysis failed:', error.message)
      process.exit(1)
    }
  }

  analyzeChunks() {
    console.log('📦 Analyzing JavaScript chunks...')

    if (!fs.existsSync(this.buildDir)) {
      console.log('⚠️  Build directory not found. Run a production build first.')
      return
    }

    const files = this.getJavaScriptFiles(this.buildDir)

    files.forEach(file => {
      const stats = fs.statSync(file)
      const relativePath = path.relative(this.buildDir, file)
      const sizeKB = (stats.size / 1024).toFixed(2)

      this.results.chunks.push({
        name: relativePath,
        size: stats.size,
        sizeKB: parseFloat(sizeKB)
      })

      this.results.totalSize += stats.size
    })

    // Sort by size (largest first)
    this.results.chunks.sort((a, b) => b.size - a.size)
  }

  analyzeAssets() {
    console.log('🎨 Analyzing static assets...')

    const assetsDir = path.join(this.buildDir, 'assets')
    if (!fs.existsSync(assetsDir)) {
      return
    }

    const assetFiles = this.getAllFiles(assetsDir, [
      '.png',
      '.jpg',
      '.jpeg',
      '.svg',
      '.ico',
      '.woff',
      '.woff2'
    ])

    assetFiles.forEach(file => {
      const stats = fs.statSync(file)
      const relativePath = path.relative(this.buildDir, file)
      const sizeKB = (stats.size / 1024).toFixed(2)

      if (stats.size > 100 * 1024) {
        // Files larger than 100KB
        this.results.recommendations.push({
          type: 'asset',
          message: `Large asset: ${relativePath} (${sizeKB}KB) - consider optimization`,
          severity: stats.size > 500 * 1024 ? 'high' : 'medium'
        })
      }
    })
  }

  generateReport() {
    console.log('\n📊 Bundle Analysis Report')
    console.log('========================\n')

    const totalSizeKB = (this.results.totalSize / 1024).toFixed(2)
    const totalSizeMB = (this.results.totalSize / (1024 * 1024)).toFixed(2)

    console.log(`Total Bundle Size: ${totalSizeKB}KB (${totalSizeMB}MB)\n`)

    console.log('📦 Largest Chunks:')
    this.results.chunks.slice(0, 10).forEach((chunk, index) => {
      const percentage = ((chunk.size / this.results.totalSize) * 100).toFixed(1)
      console.log(`${index + 1}. ${chunk.name}: ${chunk.sizeKB}KB (${percentage}%)`)
    })

    console.log('\n🎯 Chunk Size Analysis:')
    const largeChunks = this.results.chunks.filter(c => c.sizeKB > 500)
    const mediumChunks = this.results.chunks.filter(c => c.sizeKB > 200 && c.sizeKB <= 500)
    const smallChunks = this.results.chunks.filter(c => c.sizeKB <= 200)

    console.log(`Large chunks (>500KB): ${largeChunks.length}`)
    console.log(`Medium chunks (200-500KB): ${mediumChunks.length}`)
    console.log(`Small chunks (<200KB): ${smallChunks.length}`)
  }

  provideRecommendations() {
    console.log('\n💡 Optimization Recommendations')
    console.log('================================\n')

    // Analyze chunks for recommendations
    const largeChunks = this.results.chunks.filter(c => c.sizeKB > 500)

    if (largeChunks.length > 0) {
      console.log('🔧 Large Chunk Optimizations:')
      largeChunks.forEach(chunk => {
        if (chunk.name.includes('vendor')) {
          console.log(
            `  • ${chunk.name} (${chunk.sizeKB}KB) - Consider splitting vendor dependencies further`
          )
        } else if (chunk.name.includes('audio') || chunk.name.includes('processing')) {
          console.log(
            `  • ${chunk.name} (${chunk.sizeKB}KB) - Use dynamic imports for audio processing features`
          )
        } else {
          console.log(
            `  • ${chunk.name} (${chunk.sizeKB}KB) - Consider code splitting or lazy loading`
          )
        }
      })
      console.log()
    }

    // General recommendations
    const recommendations = [
      "Use dynamic imports for large features that aren't immediately needed",
      'Consider using a CDN for large vendor libraries',
      'Implement service worker caching for better repeat load performance',
      'Use tree shaking to eliminate unused code',
      'Compress images and use modern formats (WebP, AVIF)'
    ]

    console.log('🚀 General Recommendations:')
    recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`)
    })

    // Asset recommendations
    if (this.results.recommendations.length > 0) {
      console.log('\n📁 Asset Recommendations:')
      this.results.recommendations.forEach(rec => {
        const icon = rec.severity === 'high' ? '🔴' : '🟡'
        console.log(`  ${icon} ${rec.message}`)
      })
    }

    console.log('\n✅ Analysis complete! Use these insights to optimize your build.')
  }

  getJavaScriptFiles(dir) {
    const files = []
    const items = fs.readdirSync(dir)

    items.forEach(item => {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        files.push(...this.getJavaScriptFiles(fullPath))
      } else if (item.endsWith('.js') || item.endsWith('.mjs')) {
        files.push(fullPath)
      }
    })

    return files
  }

  getAllFiles(dir, extensions = []) {
    const files = []
    const items = fs.readdirSync(dir)

    items.forEach(item => {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath, extensions))
      } else if (extensions.length === 0 || extensions.some(ext => item.endsWith(ext))) {
        files.push(fullPath)
      }
    })

    return files
  }
}

// CLI interface
if (require.main === module) {
  const analyzer = new BundleAnalyzer()
  analyzer.analyze()
}

module.exports = BundleAnalyzer
