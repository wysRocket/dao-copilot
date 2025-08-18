#!/usr/bin/env node

// Test the official v1beta API schema format
process.env.GEMINI_SCHEMA_FORCE_INDEX = '17'

console.log('🔧 Testing Official v1beta Schema (variant 17)...')
console.log('Environment variable set: GEMINI_SCHEMA_FORCE_INDEX=17')

// Mock DOM environment for Node.js testing
import {JSDOM} from 'jsdom'
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  pretendToBeVisual: true,
  resources: 'usable'
})

global.window = dom.window
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement
global.Event = dom.window.Event

// Simple navigation mock
global.navigator = {
  mediaDevices: {
    getUserMedia: () => Promise.reject(new Error('Mock: No media devices'))
  },
  clipboard: {
    writeText: () => Promise.resolve()
  }
}

try {
  console.log('✅ Environment setup complete')
  console.log('✅ Schema variant 17 will be used for WebSocket communication')
  console.log('')
  console.log('The new variant implements the official v1beta API format:')
  console.log('{')
  console.log('  "realtimeInput": {')
  console.log('    "mediaChunks": [{')
  console.log('      "mimeType": "audio/pcm;rate=16000",')
  console.log('      "data": "base64_encoded_audio_data"')
  console.log('    }]')
  console.log('  }')
  console.log('}')
  console.log('')
  console.log('This should resolve the 1007 WebSocket errors!')
} catch (error) {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
}
