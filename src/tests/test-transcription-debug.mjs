#!/usr/bin/env node

/**
 * Debug script for transcription issues
 * This will run a simple transcription test with enhanced logging
 */

import {transcribeAudio} from './src/services/transcription-service.js'

console.log('🧪 Running transcription debug test...\n')

// Test with a very simple audio buffer (silence with some noise)
const sampleRate = 16000
const durationSeconds = 3
const bufferSize = sampleRate * durationSeconds

// Create a simple test audio buffer with some variation (not just silence)
const audioBuffer = Buffer.alloc(bufferSize * 2) // 16-bit samples
for (let i = 0; i < bufferSize; i++) {
  // Add some low-level noise pattern
  const sample = Math.sin(i * 0.01) * 1000 + Math.random() * 500
  const sampleInt = Math.floor(sample)
  audioBuffer.writeInt16LE(sampleInt, i * 2)
}

console.log('🎵 Created test audio buffer:', {
  size: audioBuffer.length,
  duration: durationSeconds,
  sampleRate: sampleRate
})

async function runTest() {
  try {
    console.log('🚀 Starting transcription...')

    const result = await transcribeAudio(audioBuffer, {
      format: 'pcm',
      sampleRate: 16000,
      channels: 1,
      timeout: 15000
    })

    console.log('✅ Transcription completed:', {
      text: result.text,
      textLength: result.text ? result.text.length : 0,
      duration: result.duration,
      source: result.source,
      confidence: result.confidence
    })

    if (!result.text || result.text.length === 0) {
      console.log('⚠️ No transcription text received - this indicates the issue we are debugging')
    }
  } catch (error) {
    console.error('❌ Transcription test failed:', error.message)
  }
}

runTest()
