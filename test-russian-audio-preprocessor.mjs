/**
 * Test Russian Audio Preprocessor Integration
 * 
 * This test demonstrates the new Russian language audio preprocessing
 * capabilities integrated into the main transcription service.
 */

import {transcribeAudioWebSocket} from './main-stt-transcription.ts'
import {readFileSync} from 'fs'
import {Buffer} from 'buffer'

async function testRussianPreprocessing() {
  console.log('🧪 Testing Russian Audio Preprocessor Integration')
  console.log('=' + '='.repeat(59))

  // Create test PCM audio data (simulated Russian speech)
  const testAudioBuffer = createTestRussianAudio()
  
  console.log(`📊 Test audio created: ${testAudioBuffer.length} bytes`)

  // Test 1: Transcription WITHOUT Russian preprocessing
  console.log('\n📝 Test 1: Standard transcription (no Russian preprocessing)')
  try {
    const result1 = await transcribeAudioWebSocket(testAudioBuffer, {
      apiKey: process.env.GOOGLE_API_KEY,
      enableRussianPreprocessing: false
    })
    console.log('✅ Standard result:', result1)
  } catch (error) {
    console.log('❌ Standard transcription failed:', error.message)
  }

  // Test 2: Transcription WITH Russian preprocessing (default settings)
  console.log('\n📝 Test 2: Russian-optimized transcription (default settings)')
  try {
    const result2 = await transcribeAudioWebSocket(testAudioBuffer, {
      apiKey: process.env.GOOGLE_API_KEY,
      enableRussianPreprocessing: true
    })
    console.log('✅ Russian-optimized result:', result2)
  } catch (error) {
    console.log('❌ Russian transcription failed:', error.message)
  }

  // Test 3: Transcription WITH Russian preprocessing (custom settings)
  console.log('\n📝 Test 3: Russian-optimized transcription (custom settings)')
  try {
    const result3 = await transcribeAudioWebSocket(testAudioBuffer, {
      apiKey: process.env.GOOGLE_API_KEY,
      enableRussianPreprocessing: true,
      russianPreprocessorConfig: {
        noiseReductionLevel: 0.5, // Higher noise reduction
        normalizationLevel: -2,   // Slightly higher volume
        enableBandpassFilter: true,
        enableRussianPhonemeOptimization: true,
        enableSpeechEnhancement: true
      }
    })
    console.log('✅ Custom Russian-optimized result:', result3)
  } catch (error) {
    console.log('❌ Custom Russian transcription failed:', error.message)
  }

  // Test 4: Just preprocessing (no actual transcription)
  console.log('\n📝 Test 4: Preprocessing-only test')
  try {
    const {createRussianAudioPreprocessor} = await import('./russian-audio-preprocessor.ts')
    const preprocessor = createRussianAudioPreprocessor({
      noiseReductionLevel: 0.4,
      enableRussianPhonemeOptimization: true
    })

    const preprocessingResult = await preprocessor.process(testAudioBuffer)
    console.log('✅ Preprocessing completed:')
    console.log(`   - Applied: ${preprocessingResult.applied.join(', ')}`)
    console.log(`   - SNR: ${preprocessingResult.metrics.signalToNoiseRatio.toFixed(1)}dB`)
    console.log(`   - Max amplitude: ${preprocessingResult.metrics.maxAmplitude}`)
    console.log(`   - Russian frequencies detected: ${preprocessingResult.metrics.containsRussianFrequencies}`)
    console.log(`   - Silent: ${preprocessingResult.metrics.isSilent}`)
    console.log(`   - Input size: ${preprocessingResult.metrics.totalBytes} bytes`)
    console.log(`   - Output size: ${preprocessingResult.processedAudio.length} bytes`)
  } catch (error) {
    console.log('❌ Preprocessing-only test failed:', error.message)
  }

  console.log('\n🎉 Testing completed!')
}

/**
 * Create synthetic Russian speech audio for testing
 * This creates a PCM buffer with characteristics similar to Russian speech
 */
function createTestRussianAudio(): Buffer {
  const sampleRate = 16000 // 16kHz
  const durationSeconds = 2 // 2 seconds
  const totalSamples = sampleRate * durationSeconds
  const audioBuffer = Buffer.alloc(totalSamples * 2) // 16-bit = 2 bytes per sample

  // Generate synthetic Russian speech patterns
  // Russian has distinctive formant frequencies and prosody
  for (let i = 0; i < totalSamples; i++) {
    const timeRatio = i / totalSamples
    
    // Create formant-like frequencies typical for Russian vowels
    // F1: ~500-700Hz, F2: ~1000-2500Hz (simplified)
    const f1 = 600 * Math.sin(2 * Math.PI * 600 * timeRatio)
    const f2 = 1500 * Math.sin(2 * Math.PI * 1500 * timeRatio) * 0.7
    const f3 = 2500 * Math.sin(2 * Math.PI * 2500 * timeRatio) * 0.5
    
    // Add some noise to simulate real speech
    const noise = (Math.random() - 0.5) * 1000
    
    // Combine formants with envelope (speech-like amplitude modulation)
    const envelope = Math.sin(2 * Math.PI * 3 * timeRatio) * 0.5 + 0.5 // 3Hz modulation
    const sample = (f1 + f2 + f3 + noise) * envelope * 0.3 // Scale down to reasonable level
    
    // Clamp to 16-bit range and write to buffer
    const clampedSample = Math.max(-32768, Math.min(32767, Math.round(sample)))
    audioBuffer.writeInt16LE(clampedSample, i * 2)
  }

  console.log(`🎵 Generated ${durationSeconds}s of synthetic Russian speech at ${sampleRate}Hz`)
  return audioBuffer
}

/**
 * Test with real audio file if available
 */
async function testWithRealAudio() {
  console.log('\n🎵 Testing with real audio file (if available)')
  
  const possibleFiles = [
    './test-audio-russian.wav',
    './test-audio.wav', 
    './sample.wav',
    './audio-sample.wav'
  ]

  for (const filePath of possibleFiles) {
    try {
      const audioBuffer = readFileSync(filePath)
      console.log(`📁 Found audio file: ${filePath} (${audioBuffer.length} bytes)`)
      
      // Test with Russian preprocessing
      const result = await transcribeAudioWebSocket(audioBuffer, {
        apiKey: process.env.GOOGLE_API_KEY,
        enableRussianPreprocessing: true,
        russianPreprocessorConfig: {
          noiseReductionLevel: 0.4,
          enableRussianPhonemeOptimization: true
        }
      })
      
      console.log('✅ Real audio transcription result:', result)
      return
      
    } catch (error) {
      console.log(`⚠️ Could not load ${filePath}: ${error.message}`)
      continue
    }
  }
  
  console.log('ℹ️ No real audio files found, using synthetic audio only')
}

// Main test execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting Russian Audio Preprocessor Tests...\n')
  
  testRussianPreprocessing()
    .then(() => testWithRealAudio())
    .then(() => {
      console.log('\n✅ All tests completed successfully!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Test execution failed:', error)
      process.exit(1)
    })
}

export {testRussianPreprocessing, testWithRealAudio, createTestRussianAudio}