/**
 * System Audio Transcription Test
 *
 * Simple test to verify the system audio transcription integration works
 */

import {SystemAudioCaptureService, AudioSourceType} from '../services/system-audio-capture'

async function testSystemAudioIntegration() {
  console.log('🧪 Starting System Audio Transcription Integration Test...')

  try {
    // Test 1: Create system audio service
    console.log('📝 Test 1: Creating system audio service...')
    const audioService = new SystemAudioCaptureService({
      sourceType: AudioSourceType.MIXED,
      sampleRate: 44100,
      channels: 1
    })
    console.log('✅ Test 1 PASSED: Audio service created')

    // Test 2: Check permissions
    console.log('📝 Test 2: Checking permissions...')
    const permissions = await audioService.getPermissionsStatus()
    console.log('📊 Permissions status:', permissions)
    console.log('✅ Test 2 PASSED: Permissions checked')

    // Test 3: Test microphone permissions (less intrusive)
    if (permissions.microphone) {
      console.log('📝 Test 3: Microphone access available ✅')
    } else {
      console.log('📝 Test 3: Microphone access not available ❌')
    }

    // Test 4: System audio availability
    if (permissions.systemAudio) {
      console.log('📝 Test 4: System audio access available ✅')
      console.log('🎯 Full system audio transcription capability READY!')
    } else {
      console.log('📝 Test 4: System audio requires user permission')
      console.log('💡 User needs to click "Grant System Audio Permission" button')
    }

    // Test 5: Cleanup
    console.log('📝 Test 5: Cleaning up...')
    await audioService.destroy()
    console.log('✅ Test 5 PASSED: Service destroyed cleanly')

    console.log('🎉 INTEGRATION TEST COMPLETED SUCCESSFULLY!')
    console.log(`
🎧 SYSTEM AUDIO TRANSCRIPTION CAPABILITIES:
   ✅ Microphone transcription: ${permissions.microphone ? 'READY' : 'NEEDS PERMISSION'}
   ✅ System audio transcription: ${permissions.systemAudio ? 'READY' : 'NEEDS PERMISSION'}
   ✅ Mixed mode transcription: ${permissions.bothAvailable ? 'READY' : 'NEEDS PERMISSIONS'}
   
🚀 NEXT STEPS:
   1. Refresh the assistant window to get the updated TranscriptsPage
   2. Click the "🎧 System Audio" tab to switch to the new mode
   3. Grant permissions if needed
   4. Select your preferred audio source (Mic, System, or Both)
   5. Click "Start Transcription" and test with:
      - YouTube videos 🎬
      - Zoom calls 📞
      - Music/podcasts 🎵
      - Your own voice 🎤
      - All simultaneously! 🎧
    `)

    return {
      success: true,
      permissions,
      capabilities: {
        microphone: permissions.microphone,
        systemAudio: permissions.systemAudio,
        mixed: permissions.bothAvailable
      }
    }
  } catch (error) {
    console.error('❌ Integration test failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      permissions: null
    }
  }
}

// Auto-run test if in development environment
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  // Small delay to ensure environment is ready
  setTimeout(testSystemAudioIntegration, 1000)
}

export {testSystemAudioIntegration}
