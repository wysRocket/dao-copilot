/**
 * Configuration Validation Script
 * Validates that all services use consistent Gemini Live API configuration
 * This ensures GitHub issue #176 requirements are met across the entire application
 */

import {readFileSync} from 'fs'
import {join} from 'path'

const PROJECT_ROOT = process.cwd()

interface ValidationResult {
  file: string
  isValid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Expected configuration values from GitHub issue #176
 */
const EXPECTED_CONFIG = {
  model: 'gemini-live-2.5-flash-preview',
  endpoint:
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent',
  responseModalities: ['TEXT', 'AUDIO']
}

/**
 * Files to validate
 */
const FILES_TO_VALIDATE = [
  {
    path: 'src/services/gemini-live-websocket.ts',
    patterns: [
      {
        pattern: /model:\s*['"`]gemini-live-2\.5-flash-preview['"`]/,
        description: 'Default model configuration'
      },
      {
        pattern: /v1alpha\.GenerativeService\.BidiGenerateContent/,
        description: 'WebSocket endpoint'
      },
      {
        pattern: /responseModalities:\s*\[['"`]TEXT['"`],\s*['"`]AUDIO['"`]\]/,
        description: 'Response modalities'
      }
    ]
  },
  {
    path: 'src/helpers/gemini-websocket-config.ts',
    patterns: [
      {
        pattern: /v1alpha\.GenerativeService\.BidiGenerateContent/,
        description: 'Default WebSocket URL'
      }
    ]
  },
  {
    path: 'src/services/gemini-live-websocket-test.ts',
    patterns: [
      {
        pattern: /model:\s*['"`]gemini-live-2\.5-flash-preview['"`]/,
        description: 'Test model configuration'
      }
    ]
  },
  {
    path: 'src/services/gemini-live-integration-test.ts',
    patterns: [
      {
        pattern: /model:\s*['"`]gemini-live-2\.5-flash-preview['"`]/,
        description: 'Integration test model'
      }
    ]
  },
  {
    path: 'src/services/gemini-message-handler.ts',
    patterns: [
      {
        pattern: /['"`]gemini-live-2\.5-flash-preview['"`]/,
        description: 'Message handler default model'
      }
    ]
  },
  {
    path: 'src/services/websocket-connection-establisher.ts',
    patterns: [
      {
        pattern: /v1alpha\.GenerativeService\.BidiGenerateContent/,
        description: 'Connection establisher endpoint'
      },
      {
        pattern: /['"`]gemini-live-2\.5-flash-preview['"`]/,
        description: 'Connection establisher model'
      }
    ]
  },
  {
    path: '.env.example',
    patterns: [
      {
        pattern: /v1alpha\.GenerativeService\.BidiGenerateContent/,
        description: 'Environment example endpoint'
      }
    ]
  }
]

/**
 * Validate a single file
 */
function validateFile(
  filePath: string,
  patterns: Array<{pattern: RegExp; description: string}>
): ValidationResult {
  const result: ValidationResult = {
    file: filePath,
    isValid: true,
    errors: [],
    warnings: []
  }

  try {
    const fullPath = join(PROJECT_ROOT, filePath)
    const content = readFileSync(fullPath, 'utf-8')

    for (const {pattern, description} of patterns) {
      if (!pattern.test(content)) {
        result.isValid = false
        result.errors.push(`Missing or incorrect ${description}`)
      }
    }

    // Check for old configuration patterns
    const oldPatterns = [
      {pattern: /gemini-2\.0-flash-live-001/, description: 'Old model name found'},
      {
        pattern: /v1beta\.GenerativeService\.LiveStreaming/,
        description: 'Old WebSocket endpoint found'
      },
      {
        pattern: /v1beta\/models\/gemini-2\.5-flash-preview/,
        description: 'Old v1beta endpoint found'
      }
    ]

    for (const {pattern, description} of oldPatterns) {
      if (pattern.test(content)) {
        result.warnings.push(description)
      }
    }
  } catch (error) {
    result.isValid = false
    result.errors.push(
      `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }

  return result
}

/**
 * Run comprehensive validation
 */
function runValidation(): void {
  console.log('🔍 Validating Gemini Live API Configuration Consistency')
  console.log('='.repeat(60))
  console.log()

  const results: ValidationResult[] = []
  let totalFiles = 0
  let validFiles = 0

  for (const fileConfig of FILES_TO_VALIDATE) {
    totalFiles++
    const result = validateFile(fileConfig.path, fileConfig.patterns)
    results.push(result)

    if (result.isValid) {
      validFiles++
      console.log(`✅ ${result.file}`)
    } else {
      console.log(`❌ ${result.file}`)
      for (const error of result.errors) {
        console.log(`   Error: ${error}`)
      }
    }

    if (result.warnings.length > 0) {
      console.log(`⚠️  ${result.file} - Warnings:`)
      for (const warning of result.warnings) {
        console.log(`   Warning: ${warning}`)
      }
    }
  }

  console.log()
  console.log('📊 Validation Summary')
  console.log('-'.repeat(30))
  console.log(`Total files checked: ${totalFiles}`)
  console.log(`Valid files: ${validFiles}`)
  console.log(`Files with issues: ${totalFiles - validFiles}`)

  if (validFiles === totalFiles) {
    console.log()
    console.log('🎉 All configuration files are consistent!')
    console.log('✅ GitHub issue #176 requirements are properly implemented')
    console.log(`✅ Model: ${EXPECTED_CONFIG.model}`)
    console.log(`✅ Endpoint: ${EXPECTED_CONFIG.endpoint}`)
    console.log(`✅ Response Modalities: ${EXPECTED_CONFIG.responseModalities.join(', ')}`)
  } else {
    console.log()
    console.log('❌ Configuration inconsistencies found!')
    console.log('Please review and fix the issues above.')
    process.exit(1)
  }
}

/**
 * Export for use in other modules
 */
export function validateConfiguration(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const results = FILES_TO_VALIDATE.map(fileConfig =>
        validateFile(fileConfig.path, fileConfig.patterns)
      )

      const allValid = results.every(result => result.isValid)
      resolve(allValid)
    } catch (error) {
      console.error('Validation failed:', error)
      resolve(false)
    }
  })
}

// Run validation if this file is executed directly
if (require.main === module) {
  runValidation()
}

export default {
  validateConfiguration,
  runValidation,
  EXPECTED_CONFIG,
  FILES_TO_VALIDATE
}
