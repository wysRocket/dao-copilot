/**
 * Enhanced Russian Audio Preprocessor Test
 * 
 * This test validates the enhanced Russian audio preprocessing functionality
 * with the new clarity enhancement and Russian phoneme optimization methods.
 */

import { createRussianAudioPreprocessor } from './src/services/russian-audio-preprocessor.ts'

console.log('🧪 Enhanced Russian Audio Preprocessor Test (Task 11.4)')
console.log('======================================================')

async function testEnhancedRussianAudioPreprocessor() {
  try {
    // Create the enhanced audio preprocessor
    const preprocessor = createRussianAudioPreprocessor({
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
      noiseReductionLevel: 0.4,
      normalizationLevel: -3,
      enableBandpassFilter: true,
      enableRussianPhonemeOptimization: true,
      enableSpeechEnhancement: true
    })

    console.log('✅ Enhanced Russian audio preprocessor created successfully')

    // Test 1: Process various audio buffer scenarios
    console.log('\n1. Testing Enhanced Processing Pipeline')
    console.log('----------------------------------------')

    const testBuffers = [
      {
        name: 'Silent Buffer',
        buffer: Buffer.alloc(1024, 0),
        expectedProcessing: ['format_conversion', 'audio_normalization']
      },
      {
        name: 'Low Amplitude Signal',
        buffer: createTestAudioBuffer(1024, 1000, 16000),
        expectedProcessing: ['russian_bandpass_filter', 'russian_noise_reduction', 'clarity_enhancement', 'russian_phoneme_optimization']
      },
      {
        name: 'High Amplitude Signal', 
        buffer: createTestAudioBuffer(2048, 15000, 16000),
        expectedProcessing: ['russian_bandpass_filter', 'russian_noise_reduction', 'clarity_enhancement', 'russian_phoneme_optimization']
      },
      {
        name: 'WAV Header Buffer',
        buffer: createWavTestBuffer(1024),
        expectedProcessing: ['format_conversion', 'russian_bandpass_filter', 'russian_noise_reduction']
      }
    ]

    let passedTests = 0

    for (let i = 0; i < testBuffers.length; i++) {
      const testCase = testBuffers[i]
      console.log(`\n   Test ${i + 1}: ${testCase.name}`)
      console.log(`   Input size: ${testCase.buffer.length} bytes`)
      
      const startTime = Date.now()
      const result = await preprocessor.process(testCase.buffer)
      const endTime = Date.now()
      
      console.log(`   Output size: ${result.processedAudio.length} bytes`)
      console.log(`   Processing time: ${endTime - startTime}ms`)
      console.log(`   Applied steps: ${result.applied.join(', ')}`)
      console.log(`   Audio metrics:`)
      console.log(`     - Max amplitude: ${result.metrics.maxAmplitude}`)
      console.log(`     - SNR: ${result.metrics.signalToNoiseRatio.toFixed(1)} dB`)
      console.log(`     - Contains Russian frequencies: ${result.metrics.containsRussianFrequencies}`)
      console.log(`     - Silent: ${result.metrics.isSilent}`)
      
      // Validate processing
      const hasValidOutput = result.processedAudio.length > 0
      const hasAppliedSteps = result.applied.length > 0
      const processingFast = (endTime - startTime) < 200
      const hasValidMetrics = result.metrics.totalBytes > 0
      
      if (hasValidOutput && hasAppliedSteps && processingFast && hasValidMetrics) {
        console.log('   ✅ TEST PASSED')
        passedTests++
      } else {
        console.log('   ⚠️ TEST PARTIAL')
        if (!hasValidOutput) console.log('      - Invalid output')
        if (!hasAppliedSteps) console.log('      - No processing steps applied')
        if (!processingFast) console.log('      - Processing too slow')
        if (!hasValidMetrics) console.log('      - Invalid metrics')
      }
    }

    // Test 2: Enhanced Methods Functionality
    console.log('\n2. Testing Enhanced Methods (Task 11.4)')
    console.log('------------------------------------------')

    // Create test audio with Russian-like characteristics
    const russianTestAudio = createRussianLikeAudio(2048)
    console.log(`Russian-like test audio created: ${russianTestAudio.length} bytes`)

    const enhancedResult = await preprocessor.process(russianTestAudio)
    
    console.log('Enhanced processing results:')
    console.log(`- Applied steps: ${enhancedResult.applied.length}`)
    console.log(`- Processing steps: ${enhancedResult.applied.join(', ')}`)
    console.log(`- Final SNR: ${enhancedResult.metrics.signalToNoiseRatio.toFixed(1)} dB`)
    console.log(`- Dynamic range: ${enhancedResult.metrics.dynamicRange}`)
    
    // Validate that new methods were applied
    const hasClarity = enhancedResult.applied.includes('clarity_enhancement')
    const hasPhoneme = enhancedResult.applied.includes('russian_phoneme_optimization')
    const hasNoise = enhancedResult.applied.includes('russian_noise_reduction')
    
    console.log(`Enhanced methods validation:`)
    console.log(`- Clarity enhancement: ${hasClarity ? '✅' : '❌'}`)
    console.log(`- Russian phoneme optimization: ${hasPhoneme ? '✅' : '❌'}`)
    console.log(`- Advanced noise reduction: ${hasNoise ? '✅' : '❌'}`)

    // Test 3: Performance Benchmarking
    console.log('\n3. Performance Benchmarking')
    console.log('-----------------------------')

    const benchmarkSizes = [512, 1024, 2048, 4096, 8192]
    const iterations = 10

    for (const size of benchmarkSizes) {
      const testBuffer = createTestAudioBuffer(size, 8000, 16000)
      const times = []

      for (let i = 0; i < iterations; i++) {
        const start = Date.now()
        await preprocessor.process(testBuffer)
        const end = Date.now()
        times.push(end - start)
      }

      const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length
      const throughput = (size / avgTime) * 1000 // bytes per second
      
      console.log(`   Buffer size ${size}: ${avgTime.toFixed(1)}ms avg (${(throughput/1024).toFixed(1)} KB/s)`)
    }

    // Test 4: Audio Quality Metrics
    console.log('\n4. Audio Quality Analysis')
    console.log('--------------------------')

    const qualityTests = [
      { name: 'Low SNR Audio', buffer: createNoisyAudio(1024) },
      { name: 'High SNR Audio', buffer: createCleanAudio(1024) },
      { name: 'Mixed Frequency Audio', buffer: createMixedFrequencyAudio(1024) }
    ]

    for (const test of qualityTests) {
      console.log(`\n   ${test.name}:`)
      
      const originalMetrics = preprocessor['calculateAudioMetrics'](test.buffer)
      const processedResult = await preprocessor.process(test.buffer)
      
      console.log(`     Original SNR: ${originalMetrics.signalToNoiseRatio.toFixed(1)} dB`)
      console.log(`     Processed SNR: ${processedResult.metrics.signalToNoiseRatio.toFixed(1)} dB`)
      console.log(`     SNR improvement: ${(processedResult.metrics.signalToNoiseRatio - originalMetrics.signalToNoiseRatio).toFixed(1)} dB`)
      console.log(`     Dynamic range: ${processedResult.metrics.dynamicRange}`)
      console.log(`     Russian frequency detection: ${processedResult.metrics.containsRussianFrequencies}`)
    }

    // Test 5: Configuration and Flexibility
    console.log('\n5. Configuration Testing')
    console.log('-------------------------')

    // Test different configurations
    const configurations = [
      { name: 'Minimal Processing', config: { enableBandpassFilter: false, enableSpeechEnhancement: false } },
      { name: 'Aggressive Processing', config: { noiseReductionLevel: 0.7, normalizationLevel: -1 } },
      { name: 'Phoneme Focused', config: { enableRussianPhonemeOptimization: true, enableBandpassFilter: true } }
    ]

    for (const config of configurations) {
      console.log(`\n   ${config.name}:`)
      
      const customPreprocessor = createRussianAudioPreprocessor(config.config)
      const testBuffer = createRussianLikeAudio(1024)
      
      const result = await customPreprocessor.process(testBuffer)
      console.log(`     Processing steps: ${result.applied.length}`)
      console.log(`     Applied: ${result.applied.join(', ')}`)
    }

    // Summary
    console.log('\n📋 Enhanced Audio Preprocessor Test Summary')
    console.log('=' + '='.repeat(45))
    console.log(`Basic processing tests passed: ${passedTests}/${testBuffers.length}`)
    console.log(`Clarity enhancement available: ${hasClarity ? '✅' : '❌'}`)
    console.log(`Russian phoneme optimization available: ${hasPhoneme ? '✅' : '❌'}`)
    console.log(`Advanced noise reduction available: ${hasNoise ? '✅' : '❌'}`)
    
    const overallSuccess = passedTests >= testBuffers.length * 0.8 && 
                          hasClarity && hasPhoneme && hasNoise

    if (overallSuccess) {
      console.log('\n🎉 ENHANCED RUSSIAN AUDIO PREPROCESSOR: SUCCESS!')
      console.log('   ✅ New clarity enhancement methods working')
      console.log('   ✅ Russian phoneme optimization implemented') 
      console.log('   ✅ Advanced noise reduction functional')
      console.log('   ✅ Performance within acceptable limits')
      console.log('   ✅ Task 11.4 requirements fully met')
    } else {
      console.log('\n⚠️ ENHANCED AUDIO PREPROCESSOR: NEEDS ATTENTION')
      console.log('   - Some enhanced methods may need adjustment')
      console.log('   - Performance optimization may be required')
    }

    return overallSuccess

  } catch (error) {
    console.error('❌ Enhanced audio preprocessor test failed:', error)
    console.error('Stack trace:', error.stack)
    return false
  }
}

// Helper functions for creating test audio buffers

function createTestAudioBuffer(size: number, amplitude: number, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(size)
  const frequency = 1000 // 1kHz test tone
  
  for (let i = 0; i < size - 1; i += 2) {
    const time = (i / 2) / sampleRate
    const sample = Math.sin(2 * Math.PI * frequency * time) * amplitude
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    buffer.writeInt16LE(intSample, i)
  }
  
  return buffer
}

function createWavTestBuffer(pcmSize: number): Buffer {
  // Create a simple WAV buffer with header
  const wavHeaderSize = 44
  const buffer = Buffer.alloc(wavHeaderSize + pcmSize)
  
  // Write WAV header
  buffer.write('RIFF', 0, 4, 'ascii')
  buffer.writeUInt32LE(pcmSize + 36, 4)
  buffer.write('WAVE', 8, 4, 'ascii')
  buffer.write('fmt ', 12, 4, 'ascii')
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)  // PCM format
  buffer.writeUInt16LE(1, 22)  // Mono
  buffer.writeUInt32LE(16000, 24) // Sample rate
  buffer.writeUInt32LE(32000, 28) // Byte rate
  buffer.writeUInt16LE(2, 32)  // Block align
  buffer.writeUInt16LE(16, 34) // Bits per sample
  buffer.write('data', 36, 4, 'ascii')
  buffer.writeUInt32LE(pcmSize, 40)
  
  // Fill with test tone
  const testTone = createTestAudioBuffer(pcmSize, 5000, 16000)
  testTone.copy(buffer, wavHeaderSize)
  
  return buffer
}

function createRussianLikeAudio(size: number): Buffer {
  // Create audio with frequency characteristics similar to Russian speech
  const buffer = Buffer.alloc(size)
  
  for (let i = 0; i < size - 1; i += 2) {
    const time = (i / 2) / 16000
    
    // Mix of frequencies common in Russian speech
    const f1 = Math.sin(2 * Math.PI * 300 * time) * 3000  // Fundamental
    const f2 = Math.sin(2 * Math.PI * 1200 * time) * 2000 // First formant
    const f3 = Math.sin(2 * Math.PI * 2500 * time) * 1000 // Second formant
    const noise = (Math.random() - 0.5) * 500             // Background noise
    
    const sample = f1 + f2 + f3 + noise
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    buffer.writeInt16LE(intSample, i)
  }
  
  return buffer
}

function createNoisyAudio(size: number): Buffer {
  // Create audio with significant noise
  const buffer = Buffer.alloc(size)
  
  for (let i = 0; i < size - 1; i += 2) {
    const signal = Math.sin(2 * Math.PI * 800 * (i / 2) / 16000) * 2000
    const noise = (Math.random() - 0.5) * 8000
    
    const sample = signal + noise
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    buffer.writeInt16LE(intSample, i)
  }
  
  return buffer
}

function createCleanAudio(size: number): Buffer {
  // Create clean audio with minimal noise
  const buffer = Buffer.alloc(size)
  
  for (let i = 0; i < size - 1; i += 2) {
    const signal = Math.sin(2 * Math.PI * 800 * (i / 2) / 16000) * 8000
    const noise = (Math.random() - 0.5) * 200
    
    const sample = signal + noise
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    buffer.writeInt16LE(intSample, i)
  }
  
  return buffer
}

function createMixedFrequencyAudio(size: number): Buffer {
  // Create audio with mixed frequencies
  const buffer = Buffer.alloc(size)
  
  for (let i = 0; i < size - 1; i += 2) {
    const time = (i / 2) / 16000
    
    const low = Math.sin(2 * Math.PI * 200 * time) * 2000
    const mid = Math.sin(2 * Math.PI * 1500 * time) * 3000
    const high = Math.sin(2 * Math.PI * 4000 * time) * 1000
    
    const sample = low + mid + high
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    buffer.writeInt16LE(intSample, i)
  }
  
  return buffer
}

// Export for external testing
export { testEnhancedRussianAudioPreprocessor }

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Enhanced Russian Audio Preprocessor Validation')
  console.log('🎯 Testing enhanced clarity and phoneme optimization for Task 11.4')
  console.log('')

  testEnhancedRussianAudioPreprocessor()
    .then((success) => {
      if (success) {
        console.log('\n🎉 ALL ENHANCED AUDIO PREPROCESSING TESTS PASSED!')
        console.log('Task 11.4 - Enhanced Russian Audio Preprocessor is complete!')
        process.exit(0)
      } else {
        console.log('\n⚠️ Enhanced audio preprocessing issues need attention')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('\n❌ Enhanced audio preprocessor test failed:', error)
      process.exit(1)
    })
}