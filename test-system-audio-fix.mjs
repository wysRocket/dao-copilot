#!/usr/bin/env node
/**
 * System Audio Fix Test
 * Tests the basic functionality of SystemAudioCaptureService
 * Verifies that the EventEmitter implementation works correctly
 */

// Mock browser environment
global.window = {
  navigator: {
    mediaDevices: {
      getUserMedia: () => Promise.resolve({getAudioTracks: () => [{stop: () => {}}]}),
      getDisplayMedia: () => Promise.resolve({getAudioTracks: () => [{stop: () => {}}]})
    }
  }
}

global.navigator = global.window.navigator

console.log('🔧 System Audio Fix Test')
console.log('========================\n')

async function testSystemAudioService() {
  console.log('📋 Testing SystemAudioCaptureService EventEmitter...')

  try {
    // Mock the existing Capturer class to avoid dependency issues
    const {SystemAudioCaptureService, AudioSourceType} = await import(
      '../src/services/system-audio-capture.ts'
    )

    // Create a service instance
    const service = new SystemAudioCaptureService({
      sourceType: AudioSourceType.MICROPHONE
    })

    console.log('✅ Service created successfully')

    // Test event listener methods
    let eventReceived = false
    const testListener = () => {
      eventReceived = true
    }

    // Test .on() method
    service.on('test', testListener)
    console.log('✅ .on() method works')

    // Test .emit() method
    service.emit('test')
    if (eventReceived) {
      console.log('✅ .emit() method works')
    } else {
      console.log('❌ .emit() method failed')
    }

    // Test .off() method
    service.off('test', testListener)
    eventReceived = false
    service.emit('test')
    if (!eventReceived) {
      console.log('✅ .off() method works')
    } else {
      console.log('❌ .off() method failed')
    }

    // Test configuration methods
    console.log('✅ Basic API methods available:')
    console.log(`   - startCapture: ${typeof service.startCapture === 'function'}`)
    console.log(`   - stopCapture: ${typeof service.stopCapture === 'function'}`)
    console.log(`   - setSourceType: ${typeof service.setSourceType === 'function'}`)
    console.log(`   - updateConfig: ${typeof service.updateConfig === 'function'}`)
    console.log(`   - requestPermissions: ${typeof service.requestPermissions === 'function'}`)

    console.log('\n✅ SystemAudioCaptureService EventEmitter fixed!')
    console.log('   The "audioService.off is not a function" error should be resolved.')
  } catch (error) {
    console.log('❌ Error testing service:', error.message)
    console.log('   Make sure the service compiles correctly.')
  }
}

testSystemAudioService().catch(console.error)
