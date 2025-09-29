/**
 * Debug System Audio Transcription
 * This test checks what's happening with system audio
 */

console.log('🔍 System Audio Debug Test Starting...')

// Check if we're in browser environment
if (typeof window !== 'undefined') {
  console.log('✅ Running in browser environment')

  // Check if transcription API is available
  if (window.transcriptionAPI) {
    console.log('✅ transcriptionAPI is available')
    console.log('API methods:', Object.keys(window.transcriptionAPI))
  } else {
    console.log('❌ transcriptionAPI not available on window object')
  }

  // Check media devices API
  if (navigator.mediaDevices) {
    console.log('✅ navigator.mediaDevices available')

    // Test getUserMedia (microphone)
    navigator.mediaDevices
      .getUserMedia({audio: true})
      .then(() => console.log('✅ Microphone permission available'))
      .catch(err => console.log('❌ Microphone permission denied:', err.message))

    // Test getDisplayMedia (system audio)
    if (navigator.mediaDevices.getDisplayMedia) {
      console.log('✅ getDisplayMedia (system audio capture) available')
    } else {
      console.log('❌ getDisplayMedia not available')
    }
  } else {
    console.log('❌ navigator.mediaDevices not available')
  }
} else {
  console.log('❌ Not running in browser environment')
}

console.log('🔍 Debug test complete')
