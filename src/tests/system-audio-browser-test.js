/**
 * Browser Runtime Test for System Audio
 * This file should be loaded in the browser to test system audio functionality
 */

console.log('🌐 System Audio Browser Test')
console.log('============================')

// Test browser APIs
console.log('\n📋 Testing Browser APIs...')

if (typeof window !== 'undefined') {
  console.log('✅ Running in browser environment')

  // Test navigator APIs
  if (navigator && navigator.mediaDevices) {
    console.log('✅ navigator.mediaDevices available')

    if (navigator.mediaDevices.getUserMedia) {
      console.log('✅ getUserMedia available (microphone support)')
    } else {
      console.log('❌ getUserMedia not available')
    }

    if (navigator.mediaDevices.getDisplayMedia) {
      console.log('✅ getDisplayMedia available (system audio support)')
    } else {
      console.log('❌ getDisplayMedia not available')
    }
  } else {
    console.log('❌ navigator.mediaDevices not available')
  }

  // Test Web Audio API
  if (window.AudioContext || window.webkitAudioContext) {
    console.log('✅ Web Audio API available')
  } else {
    console.log('❌ Web Audio API not available')
  }
} else {
  console.log('❌ Not running in browser environment')
}

// Test if our components can be imported
console.log('\n📋 Testing Component Imports...')

try {
  // Since we can't use ES modules directly, we'll test if the window has our components
  if (typeof window !== 'undefined') {
    // This will be set by our React components when they load
    window.systemAudioTest = {
      componentLoaded: false,
      serviceLoaded: false,
      error: null
    }

    console.log('✅ Window test object created')
    console.log('   Components will report their status here when loaded')
  }
} catch (error) {
  console.log('❌ Error setting up test environment:', error.message)
}

console.log('\n🎯 Expected Results:')
console.log('   - All browser APIs should be available in Electron')
console.log('   - System audio transcription should work')
console.log('   - No "audioService.off is not a function" errors')

// Export for use in other files
if (typeof window !== 'undefined') {
  window.testSystemAudio = () => {
    console.log('\n🧪 Testing System Audio Service...')

    if (window.systemAudioTest) {
      console.log('Component Status:', window.systemAudioTest)
    } else {
      console.log('❌ System audio test object not found')
    }
  }

  console.log('\n💡 You can call window.testSystemAudio() to check status')
}
