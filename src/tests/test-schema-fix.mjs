#!/usr/bin/env node

/**
 * Quick test to verify the schema variant initialization fix
 */

import {fork} from 'child_process'

console.log('🔧 Testing Schema Variant Initialization Fix')
console.log('============================================\n')

// Create a simple test audio file (silence)
const testAudioData = Buffer.alloc(3000, 0) // 3000 bytes of silence

console.log('📋 Creating test audio data...')
console.log(`   Audio data size: ${testAudioData.length} bytes`)

// Test via IPC to main process (simulating renderer -> main communication)
console.log('🚀 Starting transcription test...')

const child = fork('./src/main/transcription-ipc.js', [], {
  stdio: 'pipe',
  silent: false
})

// Timeout to ensure we capture the initial connection logs
setTimeout(() => {
  console.log('⏰ Sending transcription request...')

  child.send({
    type: 'transcribe',
    audioData: Array.from(testAudioData),
    options: {
      format: 'pcm',
      sampleRate: 16000,
      channels: 1
    }
  })

  // Timeout to capture logs and exit
  setTimeout(() => {
    console.log('🏁 Test complete - terminating...')
    child.kill('SIGTERM')
    process.exit(0)
  }, 3000)
}, 1000)

child.stdout.on('data', data => {
  console.log('STDOUT:', data.toString())
})

child.stderr.on('data', data => {
  console.log('STDERR:', data.toString())
})

child.on('message', message => {
  console.log('📨 IPC Response:', JSON.stringify(message, null, 2))
})

child.on('error', error => {
  console.error('❌ Child process error:', error)
})

child.on('exit', code => {
  console.log(`🏁 Child process exited with code: ${code}`)
  process.exit(code)
})

// Capture our own stdout to see schema variant logs
process.on('exit', () => {
  console.log('✅ Schema fix test completed')
})
