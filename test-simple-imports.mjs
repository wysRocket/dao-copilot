/**
 * Simple Russian Systems Import Test
 */

console.log('🧪 Testing Russian System Imports...')

async function testImports() {
  try {
    console.log('Attempting to import audio preprocessor...')
    const audioModule = await import('./src/services/russian-audio-preprocessor.ts')
    console.log('✅ Audio preprocessor imported successfully')

    console.log('Attempting to import transcription corrector...')
    const correctorModule = await import('./src/services/russian-transcription-corrector.ts')
    console.log('✅ Transcription corrector imported successfully')

    // Test basic instantiation
    console.log('Testing basic instantiation...')
    const audioProcessor = audioModule.createRussianAudioPreprocessor({})
    console.log('✅ Audio processor created')

    const textCorrector = correctorModule.createRussianTranscriptionCorrector({})
    console.log('✅ Text corrector created')

    console.log('🎉 All imports and basic instantiation successful!')
    return true
  } catch (error) {
    console.error('❌ Import test failed:', error)
    return false
  }
}

testImports().then(success => {
  process.exit(success ? 0 : 1)
})
