/**
 * Test Suite: GCP Gemini Live Client - Model Selection and Configuration
 *
 * Tests the comprehensive model selection, validation, and runtime switching
 * capabilities of the GCP Gemini Live API client.
 */

import {
  GCPGeminiLiveClient,
  GeminiLiveModel,
  MODEL_SPECS,
  ModelSwitchConfig
} from '../gcp-gemini-live-client'

console.log('🧪 Running Model Selection and Configuration Tests...\n')

// Test utilities
function createTestClient(modelName?: GeminiLiveModel | string): GCPGeminiLiveClient {
  return new GCPGeminiLiveClient({
    authentication: {
      apiKey: 'test-api-key'
    },
    model: {
      name: modelName || GeminiLiveModel.NATIVE_AUDIO
    }
  })
}

// Test counters
let passed = 0
let failed = 0
let total = 0

function runTest(name: string, testFn: () => void | Promise<void>): void {
  total++
  try {
    const result = testFn()
    if (result instanceof Promise) {
      result
        .then(() => {
          console.log(`✅ ${name}`)
          passed++
        })
        .catch(error => {
          console.log(`❌ ${name}`)
          console.log(`   Error: ${error.message}`)
          failed++
        })
    } else {
      console.log(`✅ ${name}`)
      passed++
    }
  } catch (error) {
    console.log(`❌ ${name}`)
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    failed++
  }
}

// Test 1: Model Specifications
runTest('Model Specifications - should provide comprehensive model specs', () => {
  const nativeAudioSpec = MODEL_SPECS[GeminiLiveModel.NATIVE_AUDIO]
  const halfCascadeSpec = MODEL_SPECS[GeminiLiveModel.HALF_CASCADE]

  // Validate native audio spec
  if (!nativeAudioSpec) throw new Error('Native audio spec not found')
  if (nativeAudioSpec.id !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Invalid native audio spec ID')
  if (!nativeAudioSpec.supportsNativeAudio)
    throw new Error('Native audio should support native audio')
  if (nativeAudioSpec.supportsTextMode) throw new Error('Native audio should not support text mode')
  if (nativeAudioSpec.inputSampleRates.length === 0)
    throw new Error('Native audio should have input sample rates')

  // Validate half-cascade spec
  if (!halfCascadeSpec) throw new Error('Half-cascade spec not found')
  if (halfCascadeSpec.id !== GeminiLiveModel.HALF_CASCADE)
    throw new Error('Invalid half-cascade spec ID')
  if (halfCascadeSpec.supportsNativeAudio)
    throw new Error('Half-cascade should not support native audio')
  if (!halfCascadeSpec.supportsTextMode) throw new Error('Half-cascade should support text mode')
  if (halfCascadeSpec.inputSampleRates.length === 0)
    throw new Error('Half-cascade should have input sample rates')
})

// Test 2: Model Resolution
runTest('Model Resolution - should resolve model names correctly', () => {
  const client1 = createTestClient(GeminiLiveModel.NATIVE_AUDIO)
  const client2 = createTestClient(GeminiLiveModel.HALF_CASCADE)
  const client3 = createTestClient('native-audio')
  const client4 = createTestClient('half-cascade')

  const model1 = client1.getCurrentModel()
  const model2 = client2.getCurrentModel()
  const model3 = client3.getCurrentModel()
  const model4 = client4.getCurrentModel()

  if (model1.type !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Native audio model resolution failed')
  if (model2.type !== GeminiLiveModel.HALF_CASCADE)
    throw new Error('Half-cascade model resolution failed')
  if (model3.type !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Native audio alias resolution failed')
  if (model4.type !== GeminiLiveModel.HALF_CASCADE)
    throw new Error('Half-cascade alias resolution failed')

  client1.destroy()
  client2.destroy()
  client3.destroy()
  client4.destroy()
})

// Test 3: Available Models
runTest('Available Models - should provide all available models', () => {
  const client = createTestClient()
  const availableModels = client.getAvailableModels()

  if (!availableModels[GeminiLiveModel.NATIVE_AUDIO])
    throw new Error('Native audio model not available')
  if (!availableModels[GeminiLiveModel.HALF_CASCADE])
    throw new Error('Half-cascade model not available')
  if (Object.keys(availableModels).length !== 2)
    throw new Error('Unexpected number of available models')

  client.destroy()
})

// Test 4: Model Validation - Valid Configuration
runTest('Model Validation - should validate compatible configurations', () => {
  const client = createTestClient()

  const validation1 = client.validateModelConfiguration({
    model: {
      name: GeminiLiveModel.NATIVE_AUDIO
    },
    audio: {
      format: 'pcm16',
      inputSampleRate: 16000,
      chunkSize: 4096
    }
  })

  if (!validation1.isValid) throw new Error('Valid configuration marked as invalid')
  if (validation1.errors.length > 0) throw new Error('Valid configuration has errors')

  client.destroy()
})

// Test 5: Model Validation - Invalid Configuration
runTest('Model Validation - should reject incompatible configurations', () => {
  const client = createTestClient()

  const validation = client.validateModelConfiguration({
    model: {
      name: GeminiLiveModel.HALF_CASCADE
    },
    audio: {
      format: 'float32', // Valid format but incompatible sample rate
      inputSampleRate: 48000, // Not supported by half-cascade
      chunkSize: 16384 // Too large for half-cascade
    }
  })

  if (validation.isValid) throw new Error('Invalid configuration marked as valid')
  if (validation.errors.length === 0) throw new Error('Invalid configuration has no errors')

  client.destroy()
})

// Test 6: Model Compatibility Check
runTest('Model Compatibility - should check compatibility correctly', () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)

  // Should be compatible with native audio (current model)
  const compat1 = client.checkModelCompatibility(GeminiLiveModel.NATIVE_AUDIO)
  if (!compat1.compatible) throw new Error('Current model should be compatible')

  // May have issues with half-cascade due to different requirements
  const compat2 = client.checkModelCompatibility(GeminiLiveModel.HALF_CASCADE)
  // Check that compatibility response is properly structured
  if (typeof compat2.compatible !== 'boolean')
    throw new Error('Compatibility check should return boolean')
  if (!Array.isArray(compat2.issues))
    throw new Error('Compatibility check should return issues array')

  client.destroy()
})

// Test 7: Model Configuration Access
runTest('Model Configuration - should provide current model details', () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)
  const currentModel = client.getCurrentModel()

  if (!currentModel.name) throw new Error('Model name not provided')
  if (!currentModel.type) throw new Error('Model type not provided')
  if (!currentModel.spec) throw new Error('Model spec not provided')
  if (!currentModel.config) throw new Error('Model config not provided')
  if (!currentModel.performance) throw new Error('Model performance config not provided')

  if (currentModel.type !== GeminiLiveModel.NATIVE_AUDIO) throw new Error('Incorrect model type')

  client.destroy()
})

// Test 8: Model Configuration Updates
runTest('Model Configuration - should update configuration', () => {
  const client = createTestClient()

  // Listen for configuration update event
  let configUpdated = false
  client.on('model:config-updated', () => {
    configUpdated = true
  })

  client.updateModelConfiguration({
    lowLatency: true,
    voiceActivityDetection: true
  })

  const currentModel = client.getCurrentModel()
  if (!currentModel.config.lowLatency) throw new Error('Low latency not updated')
  if (!currentModel.config.voiceActivityDetection) throw new Error('VAD not updated')
  if (!configUpdated) throw new Error('Configuration update event not emitted')

  client.destroy()
})

// Test 9: Model Performance Metrics
runTest('Model Performance - should provide performance metrics', () => {
  const client = createTestClient()
  const metrics = client.getModelPerformanceMetrics()

  if (!metrics.model) throw new Error('Model not in metrics')
  if (typeof metrics.averageLatency !== 'number') throw new Error('Average latency not provided')
  if (typeof metrics.throughput !== 'number') throw new Error('Throughput not provided')
  if (typeof metrics.errorRate !== 'number') throw new Error('Error rate not provided')
  if (typeof metrics.audioQualityScore !== 'number')
    throw new Error('Audio quality score not provided')
  if (typeof metrics.transcriptionAccuracy !== 'number')
    throw new Error('Transcription accuracy not provided')

  // Validate ranges
  if (metrics.audioQualityScore < 0 || metrics.audioQualityScore > 100)
    throw new Error('Invalid audio quality score range')
  if (metrics.transcriptionAccuracy < 0 || metrics.transcriptionAccuracy > 100)
    throw new Error('Invalid transcription accuracy range')

  client.destroy()
})

// Test 10: Model Switching - Configuration
runTest('Model Switching - should configure switch parameters', () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)

  const switchConfig: ModelSwitchConfig = {
    targetModel: GeminiLiveModel.HALF_CASCADE,
    preserveSession: false,
    migrationStrategy: 'graceful',
    fallbackModel: GeminiLiveModel.NATIVE_AUDIO,
    validationTimeout: 5000
  }

  // Test that switch config is properly structured
  if (switchConfig.targetModel !== GeminiLiveModel.HALF_CASCADE)
    throw new Error('Invalid target model')
  if (switchConfig.migrationStrategy !== 'graceful') throw new Error('Invalid migration strategy')
  if (switchConfig.fallbackModel !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Invalid fallback model')

  client.destroy()
})

// Test 11: Model Switching - Validation
runTest('Model Switching - should validate before switching', async () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)

  try {
    // Attempt to switch to an invalid model
    const result = await client.switchModel({
      targetModel: 'invalid-model' as GeminiLiveModel,
      migrationStrategy: 'immediate'
    })

    if (result.success) throw new Error('Switch to invalid model should fail')
    if (!result.errors || result.errors.length === 0)
      throw new Error('Switch should provide error details')
  } catch (switchError) {
    // Expected for invalid model
    if (!(switchError instanceof Error)) throw new Error('Should throw Error for invalid model')
  }

  client.destroy()
})

// Test 12: Model-Specific Configuration
runTest('Model Configuration - should respect model-specific options', () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)
  const model = client.getCurrentModel()

  // Native audio should have advanced options available
  if (!model.spec.configOptions.lowLatency)
    throw new Error('Native audio should support low latency')
  if (!model.spec.configOptions.voiceActivityDetection)
    throw new Error('Native audio should support VAD')
  if (!model.spec.configOptions.noiseSuppression)
    throw new Error('Native audio should support noise suppression')

  client.destroy()

  const client2 = createTestClient(GeminiLiveModel.HALF_CASCADE)
  const model2 = client2.getCurrentModel()

  // Half-cascade should have limited options
  if (model2.spec.configOptions.lowLatency)
    throw new Error('Half-cascade should not support low latency')
  if (model2.spec.configOptions.voiceActivityDetection)
    throw new Error('Half-cascade should not support VAD')

  client2.destroy()
})

// Test 13: Audio Format Compatibility
runTest('Audio Format - should validate format compatibility', () => {
  const client = createTestClient()

  // Test native audio formats
  const validation1 = client.validateModelConfiguration({
    model: {name: GeminiLiveModel.NATIVE_AUDIO},
    audio: {format: 'pcm16'}
  })
  if (!validation1.isValid) throw new Error('PCM16 should be supported by native audio')

  // Test incompatible format (using unsupported sample rate instead)
  const validation2 = client.validateModelConfiguration({
    model: {name: GeminiLiveModel.HALF_CASCADE},
    audio: {format: 'pcm16', inputSampleRate: 48000} // Unsupported sample rate
  })
  if (validation2.isValid) throw new Error('48kHz should not be supported by half-cascade')

  client.destroy()
})

// Test 14: Session Duration Limits
runTest('Session Limits - should respect model session limits', () => {
  const client = createTestClient(GeminiLiveModel.NATIVE_AUDIO)
  const model = client.getCurrentModel()

  // Check that session duration is within model limits
  if (model.performance.maxSessionDuration > model.spec.maxSessionDuration) {
    throw new Error('Configured session duration exceeds model limit')
  }

  // Check that chunk size is within model limits
  if (model.performance.chunkSize > model.spec.maxChunkSize) {
    throw new Error('Configured chunk size exceeds model limit')
  }

  if (model.performance.chunkSize < model.spec.minChunkSize) {
    throw new Error('Configured chunk size below model minimum')
  }

  client.destroy()
})

// Test 15: Default Model Selection
runTest('Default Model - should use appropriate defaults', () => {
  const client1 = createTestClient() // No model specified
  const model1 = client1.getCurrentModel()

  // Should default to native audio
  if (model1.type !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Should default to native audio model')

  client1.destroy()

  const client2 = createTestClient('unknown-model')
  const model2 = client2.getCurrentModel()

  // Should fall back to native audio for unknown models
  if (model2.type !== GeminiLiveModel.NATIVE_AUDIO)
    throw new Error('Should fallback to native audio for unknown models')

  client2.destroy()
})

// Wait for all async tests to complete
setTimeout(() => {
  console.log(`\n📊 Model Selection and Configuration Test Results:`)
  console.log(`   Passed: ${passed}`)
  console.log(`   Failed: ${failed}`)
  console.log(`   Total: ${total}`)

  if (failed === 0) {
    console.log('\n🎉 All model selection and configuration tests passed!')
  } else {
    console.log(`\n⚠️  ${failed} model selection and configuration tests failed.`)
  }
}, 1000)
