// MANUAL DEBUG INSTRUCTIONS

// Open the Developer Console in your Electron app:
// 1. In the assistant window, press Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)
// 2. Go to the "Console" tab
// 3. Paste and run this code:

// Check transcription API availability
console.log('🔍 Checking transcription API...')
if (window.transcriptionAPI) {
  console.log('✅ transcriptionAPI available:', Object.keys(window.transcriptionAPI))
} else {
  console.log('❌ transcriptionAPI not available')
}

// Check media devices
if (navigator.mediaDevices) {
  console.log('✅ mediaDevices available')

  // Test microphone access
  navigator.mediaDevices
    .getUserMedia({audio: true})
    .then(() => console.log('✅ Microphone access granted'))
    .catch(err => console.log('❌ Microphone access denied:', err.message))
} else {
  console.log('❌ mediaDevices not available')
}

// Check React components
const systemAudioComponent = document.querySelector('[class*="system-audio-transcription"]')
if (systemAudioComponent) {
  console.log('✅ System audio component rendered')
} else {
  console.log('❌ System audio component not found')
}

console.log('🔍 Debug complete - check results above')
