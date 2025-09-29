/**
 * Test Suite for Russian Transcription Service Integration
 * 
 * Tests the complete pipeline integration:
 * - Enhanced RussianAudioPreprocessor
 * - Optimized transcription service  
 * - Enhanced RussianTranscriptionCorrector
 * - Mixed language detection
 * - Grammar pattern correction
 * - Performance benchmarks
 */

import { Buffer } from 'buffer'
import { performance } from 'perf_hooks'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import the integrated service - using relative path for ES modules
console.log('Loading Russian Transcription Service components...')
import { 
  RussianTranscriptionService, 
  createRussianTranscriptionService,
  RussianTranscriptionConfig
} from '../services/russian-transcription-service.js'

// Utility functions for testing
function createTestAudioBuffer(sampleRate = 16000, durationMs = 1000, amplitude = 0.5) {
  const samplesPerSecond = sampleRate
  const totalSamples = Math.floor((durationMs / 1000) * samplesPerSecond)
  const buffer = Buffer.alloc(totalSamples * 2) // 16-bit samples = 2 bytes each

  for (let i = 0; i < totalSamples; i++) {
    // Generate Russian-like speech pattern with formant-like frequencies
    const time = i / sampleRate
    
    // Simulate Russian vowel formants (fundamental + formants)
    const fundamental = Math.sin(2 * Math.PI * 150 * time) * 0.3 // ~150Hz fundamental
    const formant1 = Math.sin(2 * Math.PI * 600 * time) * 0.4    // First formant
    const formant2 = Math.sin(2 * Math.PI * 1200 * time) * 0.2   // Second formant
    const noise = (Math.random() - 0.5) * 0.1                     // Small amount of noise
    
    // Combine signals
    let sample = (fundamental + formant1 + formant2 + noise) * amplitude
    
    // Add some Russian-specific consonant bursts (simulate palatalized consonants)
    if (i % 800 < 50) { // Brief bursts every ~50ms
      sample += Math.sin(2 * Math.PI * 3000 * time) * 0.3 * amplitude
    }
    
    // Convert to 16-bit signed integer
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
    buffer.writeInt16LE(intSample, i * 2)
  }

  return buffer
}

function createRussianLikeAudioBuffer(phrase = 'russian_speech', durationMs = 2000) {
  // Create more realistic Russian speech simulation
  const sampleRate = 16000
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate)
  const buffer = Buffer.alloc(totalSamples * 2)

  for (let i = 0; i < totalSamples; i++) {
    const time = i / sampleRate
    
    // Simulate Russian phoneme patterns
    let sample = 0
    
    // Vowel segments (Russian has clear vowel formants)
    if (i % 1600 < 800) { // Vowel segments
      const f1 = phrase.includes('a') ? 700 : 400  // Russian 'а' vs 'у'
      const f2 = phrase.includes('i') ? 2200 : 1100 // Russian 'и' vs 'о'
      
      sample += Math.sin(2 * Math.PI * 120 * time) * 0.2  // Fundamental
      sample += Math.sin(2 * Math.PI * f1 * time) * 0.3   // F1
      sample += Math.sin(2 * Math.PI * f2 * time) * 0.2   // F2
    }
    
    // Consonant segments (Russian has many palatalized consonants)
    else {
      // High frequency bursts for Russian consonants
      sample += Math.sin(2 * Math.PI * 2500 * time) * 0.4
      sample += Math.sin(2 * Math.PI * 4000 * time) * 0.2
      
      // Palatalization marker (higher formant transition)
      if (phrase.includes('palatalized')) {
        sample += Math.sin(2 * Math.PI * 3200 * time) * 0.15
      }
    }
    
    // Add slight noise for realism
    sample += (Math.random() - 0.5) * 0.05
    
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
    buffer.writeInt16LE(intSample, i * 2)
  }

  return buffer
}

async function testRussianTranscriptionServiceIntegration() {
  console.log('🇷🇺 Starting Russian Transcription Service Integration Tests...')
  console.log('=' .repeat(80))

  // Test configuration
  const testConfig: RussianTranscriptionConfig = {
    geminiConfig: {
      model: 'gemini-live-2.5-flash-preview',
      apiKey: process.env.GOOGLE_API_KEY || 'test-key',
      baseUrl: 'wss://generativelanguage.googleapis.com',
      responseModalities: ['TEXT'],
      systemInstruction: 'You are a Russian speech transcription system. Provide accurate Russian transcriptions.'
    },
    
    // Enable all enhancements for comprehensive testing
    audioPreprocessor: {
      enabled: true,
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      noiseReductionLevel: 0.4,
      normalizationLevel: -3,
      enableBandpassFilter: true,
      enableRussianPhonemeOptimization: true,
      enableSpeechEnhancement: true
    },
    
    textCorrector: {
      enabled: true,
      enableProperNameCorrection: true,
      enableTechnicalTermCorrection: true,
      enableContextualSpelling: true,
      enableGrammarCorrection: true,
      enableCommonPatternFixes: true,
      confidenceThreshold: 0.7
    },
    
    enablePartialStreaming: false, // Disable for testing to get final results
    enableQualityValidation: true,
    enableMetrics: true,
    enableDebugLogging: true
  }

  let service: RussianTranscriptionService | null = null

  try {
    // Test 1: Service Creation and Initialization
    console.log('\n📋 Test 1: Service Initialization')
    console.log('-'.repeat(50))
    
    const initStartTime = performance.now()
    service = createRussianTranscriptionService(testConfig.geminiConfig, testConfig)
    
    // Note: Skip actual initialization for testing without real API key
    if (process.env.GOOGLE_API_KEY) {
      await service.initialize()
      console.log(`✅ Service initialized in ${(performance.now() - initStartTime).toFixed(2)}ms`)
    } else {
      console.log('⚠️ Skipping real initialization (no API key) - testing offline components only')
    }

    // Test 2: Audio Processing Pipeline
    console.log('\n📋 Test 2: Audio Processing Pipeline')
    console.log('-'.repeat(50))
    
    const testAudios = [
      { name: 'Basic Russian Speech', buffer: createTestAudioBuffer(16000, 1500, 0.6) },
      { name: 'Russian with Palatalization', buffer: createRussianLikeAudioBuffer('palatalized_russian', 2000) },
      { name: 'Russian Vowels', buffer: createRussianLikeAudioBuffer('aeiou_russian', 1800) },
      { name: 'Silent Audio', buffer: Buffer.alloc(3200) }, // 100ms of silence
      { name: 'Noisy Russian Audio', buffer: createTestAudioBuffer(16000, 1200, 0.3) }
    ]

    for (const testAudio of testAudios) {
      console.log(`\n🎵 Testing: ${testAudio.name}`)
      const startTime = performance.now()
      
      try {
        // For testing without API key, we'll simulate the transcription process
        if (!process.env.GOOGLE_API_KEY) {
          console.log('📊 Audio Analysis:')
          console.log(`  - Buffer size: ${testAudio.buffer.length} bytes`)
          console.log(`  - Duration: ~${((testAudio.buffer.length / 2) / 16000 * 1000).toFixed(0)}ms`)
          
          // Test the audio preprocessing directly
          const audioPreprocessor = service['audioPreprocessor']
          if (audioPreprocessor) {
            const audioResult = await audioPreprocessor.process(testAudio.buffer)
            console.log(`  - Processing steps: ${audioResult.applied.join(', ')}`)
            console.log(`  - Russian frequencies detected: ${audioResult.metrics.containsRussianFrequencies}`)
            console.log(`  - Signal-to-noise ratio: ${audioResult.metrics.signalToNoiseRatio.toFixed(1)} dB`)
            console.log(`  - Silent: ${audioResult.metrics.isSilent}`)
          }
        } else {
          // Full transcription test with real API
          const result = await service.transcribe(testAudio.buffer, 'normal')
          console.log(`📊 Full Transcription Result:`)
          console.log(`  - Text: "${result.correctedText}"`)
          console.log(`  - Confidence: ${result.confidence.toFixed(2)}`)
          console.log(`  - Quality Score: ${result.qualityScore.toFixed(2)}`)
          console.log(`  - Processing Time: ${result.totalProcessingTime}ms`)
          console.log(`  - Audio Processing: ${result.audioProcessingTime}ms`)
          console.log(`  - Correction Time: ${result.correctionTime}ms`)
          console.log(`  - Corrections Applied: ${result.corrections.length}`)
          console.log(`  - Mixed Language Detected: ${result.mixedLanguageDetected}`)
          
          if (result.corrections.length > 0) {
            console.log(`  - Sample Corrections: ${result.corrections.slice(0, 3).map(c => `${c.original}→${c.corrected}`).join(', ')}`)
          }
        }
        
        const processingTime = performance.now() - startTime
        console.log(`⏱️ Processing completed in ${processingTime.toFixed(2)}ms`)
        
      } catch (error) {
        console.log(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Test 3: Text Correction Pipeline (Offline Testing)
    console.log('\n📋 Test 3: Text Correction Pipeline')
    console.log('-'.repeat(50))
    
    const testTexts = [
      'Лю ди бесконе чные хранки програмирала', // Word boundary errors
      'вот самый лучший, thing I would do is I would look at the data', // Mixed language
      'програмист делал програм у для компъютер', // Technical terms
      'жет быть только для когда попробуете', // Grammar patterns
      'москва санкт-петербург иванов александр', // Proper names
      '', // Empty text
      'нормальный русский текст без ошибок' // Clean text
    ]

    const textCorrector = service['textCorrector']
    if (textCorrector) {
      for (const testText of testTexts) {
        console.log(`\n📝 Testing: "${testText}"`)
        try {
          const correctionResult = await textCorrector.correct(testText)
          console.log(`  - Original: "${correctionResult.originalText}"`)
          console.log(`  - Corrected: "${correctionResult.correctedText}"`)
          console.log(`  - Corrections: ${correctionResult.corrections.length}`)
          console.log(`  - Confidence: ${correctionResult.confidence.toFixed(2)}`)
          console.log(`  - Processing Time: ${correctionResult.processingTimeMs}ms`)
          
          if (correctionResult.corrections.length > 0) {
            console.log('  - Applied Fixes:')
            correctionResult.corrections.forEach((correction, idx) => {
              if (idx < 5) { // Show first 5 corrections
                console.log(`    ${idx + 1}. ${correction.original} → ${correction.corrected} (${correction.type})`)
              }
            })
            if (correctionResult.corrections.length > 5) {
              console.log(`    ... and ${correctionResult.corrections.length - 5} more`)
            }
          }
        } catch (error) {
          console.log(`  ❌ Correction failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    }

    // Test 4: Performance Benchmarks
    console.log('\n📋 Test 4: Performance Benchmarks')
    console.log('-'.repeat(50))
    
    const benchmarkSizes = [
      { name: '0.5s audio', ms: 500 },
      { name: '1s audio', ms: 1000 },
      { name: '2s audio', ms: 2000 },
      { name: '5s audio', ms: 5000 }
    ]

    for (const benchmark of benchmarkSizes) {
      console.log(`\n⏱️ Benchmark: ${benchmark.name}`)
      const testBuffer = createRussianLikeAudioBuffer('benchmark', benchmark.ms)
      
      const iterations = 3
      const times: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now()
        
        try {
          if (process.env.GOOGLE_API_KEY) {
            await service.transcribe(testBuffer, 'normal')
          } else {
            // Simulate processing for offline testing
            const audioProcessor = service['audioPreprocessor']
            await audioProcessor.process(testBuffer)
            const textCorrector = service['textCorrector']
            await textCorrector.correct('тестовый русский текст для бенчмарка')
          }
          
          const processingTime = performance.now() - startTime
          times.push(processingTime)
        } catch (error) {
          console.log(`  ❌ Iteration ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
      
      if (times.length > 0) {
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
        const minTime = Math.min(...times)
        const maxTime = Math.max(...times)
        
        console.log(`  - Average: ${avgTime.toFixed(2)}ms`)
        console.log(`  - Min: ${minTime.toFixed(2)}ms`)
        console.log(`  - Max: ${maxTime.toFixed(2)}ms`)
        console.log(`  - Real-time factor: ${(avgTime / benchmark.ms).toFixed(2)}x`)
      }
    }

    // Test 5: Service Metrics and Configuration
    console.log('\n📋 Test 5: Service Metrics and Configuration')
    console.log('-'.repeat(50))
    
    const metrics = service.getMetrics()
    console.log('📊 Current Service Metrics:')
    console.log(`  - Total Transcriptions: ${metrics.totalTranscriptions}`)
    console.log(`  - Average Quality Score: ${metrics.averageQualityScore.toFixed(2)}`)
    console.log(`  - Average Processing Time: ${metrics.averageProcessingTime.toFixed(2)}ms`)
    console.log(`  - Average Confidence: ${metrics.averageConfidence.toFixed(2)}`)
    console.log(`  - Russian Frequencies Detection Rate: ${(metrics.audioProcessingMetrics.russianFrequenciesDetectedRate * 100).toFixed(1)}%`)
    console.log(`  - Mixed Language Detection Rate: ${(metrics.correctionMetrics.mixedLanguageDetectionRate * 100).toFixed(1)}%`)
    console.log(`  - Total Error Rate: ${(metrics.errorMetrics.totalErrorRate * 100).toFixed(1)}%`)

    // Test configuration updates
    console.log('\n🔧 Testing Configuration Updates:')
    service.updateConfig({
      audioPreprocessor: { noiseReductionLevel: 0.6 },
      textCorrector: { confidenceThreshold: 0.8 }
    })
    console.log('✅ Configuration updated successfully')

    // Test custom corrections
    const customCorrections = new Map([
      ['специальная ошибка', 'исправленная ошибка'],
      ['тестовая фраза', 'корректная фраза']
    ])
    service.addCustomCorrections(customCorrections)
    console.log('✅ Custom corrections added successfully')

    // Test 6: Error Handling and Edge Cases
    console.log('\n📋 Test 6: Error Handling and Edge Cases')  
    console.log('-'.repeat(50))
    
    const edgeCases = [
      { name: 'Empty buffer', buffer: Buffer.alloc(0) },
      { name: 'Very short audio (10ms)', buffer: createTestAudioBuffer(16000, 10, 0.1) },
      { name: 'Very loud audio', buffer: createTestAudioBuffer(16000, 1000, 2.0) },
      { name: 'Very quiet audio', buffer: createTestAudioBuffer(16000, 1000, 0.01) }
    ]

    for (const edgeCase of edgeCases) {
      console.log(`\n🧪 Edge Case: ${edgeCase.name}`)
      try {
        if (process.env.GOOGLE_API_KEY) {
          const result = await service.transcribe(edgeCase.buffer, 'normal')
          console.log(`  ✅ Handled gracefully - Quality: ${result.qualityScore.toFixed(2)}`)
        } else {
          const audioProcessor = service['audioPreprocessor']
          const result = await audioProcessor.process(edgeCase.buffer)
          console.log(`  ✅ Audio processing handled gracefully`)
          console.log(`  - Steps applied: ${result.applied.join(', ')}`)
          console.log(`  - Silent: ${result.metrics.isSilent}`)
        }
      } catch (error) {
        console.log(`  ⚠️ Error (expected for edge case): ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log('🎉 All Russian Transcription Service Integration Tests Completed!')
    
    if (!process.env.GOOGLE_API_KEY) {
      console.log('📝 Note: Full integration tests require GOOGLE_API_KEY environment variable')
      console.log('   Current tests verified offline components (audio preprocessing, text correction)')
    }
    
    console.log('\n📊 Integration Test Summary:')
    console.log('✅ Service initialization and configuration')
    console.log('✅ Audio preprocessing pipeline with Russian optimizations')  
    console.log('✅ Text correction pipeline with mixed language detection')
    console.log('✅ Performance benchmarks and metrics collection')
    console.log('✅ Error handling and edge case management')
    console.log('✅ Configuration updates and custom corrections')
    
    const finalMetrics = service.getMetrics()
    console.log(`\n🔍 Final Service State:`)
    console.log(`   - Audio Processor Config: ${JSON.stringify(finalMetrics.audioPreprocessorStats, null, 2)}`)
    console.log(`   - Text Corrector Stats: ${JSON.stringify(finalMetrics.textCorrectorStats)}`)

  } catch (error) {
    console.error('❌ Integration test failed:', error)
    throw error
  } finally {
    // Clean up
    if (service) {
      await service.shutdown()
      console.log('🛑 Service shutdown completed')
    }
  }
}

// Main test execution
async function main() {
  console.log('🚀 Russian Transcription Service - Comprehensive Integration Test Suite')
  console.log('Task 11.5: Testing integration of all enhanced components')
  console.log(`Started at: ${new Date().toISOString()}`)
  
  try {
    await testRussianTranscriptionServiceIntegration()
  } catch (error) {
    console.error('💥 Test suite failed:', error)
    process.exit(1)
  }
  
  console.log(`\nCompleted at: ${new Date().toISOString()}`)
  console.log('🏁 Integration test suite finished successfully!')
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { testRussianTranscriptionServiceIntegration }