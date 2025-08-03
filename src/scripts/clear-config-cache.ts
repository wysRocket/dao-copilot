#!/usr/bin/env node

/**
 * Clear Configuration Cache Script
 *
 * This script clears any cached configuration that might contain
 * the old model name (gemini-live-2.5-flash-preview) to ensure
 * the correct model (gemini-2.0-flash-live-001) is used.
 */

import fs from 'fs'
import path from 'path'

console.log('🧹 Clearing configuration cache...')

// Clear any potential config files that might cache the old model name
const configPaths = [
  '.gemini-config.json',
  '.transcription-config.json',
  'gemini-settings.json',
  '.config/gemini.json'
]

let clearedFiles = 0

configPaths.forEach(configPath => {
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf8')
      if (content.includes('gemini-live-2.5-flash-preview')) {
        console.log(`❌ Found old model reference in ${configPath}`)
        fs.unlinkSync(configPath)
        console.log(`✅ Cleared ${configPath}`)
        clearedFiles++
      }
    } catch (error) {
      console.warn(`⚠️ Could not check/clear ${configPath}:`, error)
    }
  }
})

// Also check for environment files that might have old references
const envFiles = ['.env', '.env.local', '.env.production']
envFiles.forEach(envFile => {
  if (fs.existsSync(envFile)) {
    try {
      const content = fs.readFileSync(envFile, 'utf8')
      if (content.includes('gemini-live-2.5-flash-preview')) {
        console.log(`⚠️ WARNING: Found old model reference in ${envFile}`)
        console.log(
          'Please manually update environment variables to use: gemini-2.0-flash-live-001'
        )
      }
    } catch (error) {
      console.warn(`⚠️ Could not check ${envFile}:`, error)
    }
  }
})

console.log(`✅ Configuration cache cleanup complete. Cleared ${clearedFiles} files.`)
console.log('🔄 Please restart the application to ensure clean configuration loading.')
