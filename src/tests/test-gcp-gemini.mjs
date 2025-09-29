#!/usr/bin/env node

/**
 * Test runner for GCP Gemini Live API connectivity
 */

import {testGCPGeminiConnection} from './src/services/gcp-gemini-live-test.ts'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config()

async function main() {
  try {
    console.log('🧪 Starting GCP Gemini Live API Test')
    console.log('='.repeat(50))

    const result = await testGCPGeminiConnection()

    console.log('='.repeat(50))
    console.log(`📊 Test Result: ${result ? '✅ PASSED' : '❌ FAILED'}`)

    if (result) {
      console.log('🎉 GCP Gemini API connectivity test passed!')
    } else {
      console.log('⚠️ Test failed. Please check configuration and credentials.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Test runner failed:', error)
    process.exit(1)
  }
}

main()
