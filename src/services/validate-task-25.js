#!/usr/bin/env node

/**
 * Task 25 Model Configuration Validation Script
 * Validates that all model configurations have been updated correctly
 */

import {validateModelConfiguration} from './model-configuration-validation.js'

async function runValidation() {
  console.log('🚀 Running Task 25 Model Configuration Validation...\n')

  try {
    const result = await validateModelConfiguration()

    console.log(result.report)

    if (result.success) {
      console.log('\n✅ Task 25 COMPLETED SUCCESSFULLY!')
      console.log('All model configurations have been updated to use the correct models:')
      console.log('- Live API (WebSocket): gemini-live-2.5-flash-preview')
      console.log('- Batch API (HTTP): gemini-2.5-flash-preview-05-20')
      process.exit(0)
    } else {
      console.log('\n❌ Task 25 validation failed!')
      console.log('Some model configurations still need attention.')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Validation failed with error:', error)
    process.exit(1)
  }
}

runValidation().catch(console.error)
