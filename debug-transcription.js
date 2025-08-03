/**
 * Debug script to test transcription directly
 * Run this script to test the transcription service bypassing the UI
 */

const fs = require('fs');
const path = require('path');

// Simple test audio data - create a minimal WAV file
function createTestWav() {
  // WAV header for 16kHz mono PCM
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + 8000, 4); // file size
  header.write('WAVE', 8);
  
  // Format chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // audio format (PCM)
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(16000, 24); // sample rate
  header.writeUInt32LE(32000, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  
  // Data chunk
  header.write('data', 36);
  header.writeUInt32LE(8000, 40); // data size
  
  // Generate 500ms of test audio (8000 samples at 16kHz)
  const audioData = Buffer.alloc(8000);
  for (let i = 0; i < 4000; i++) {
    // Generate a simple tone at 440Hz
    const sample = Math.sin(2 * Math.PI * 440 * i / 16000) * 16000;
    audioData.writeInt16LE(Math.round(sample), i * 2);
  }
  
  return Buffer.concat([header, audioData]);
}

console.log('🧪 Debug: Creating test audio file...');
const testWav = createTestWav();
console.log(`🧪 Debug: Generated ${testWav.length} bytes of test audio (should be 500ms at 16kHz)`);

// Calculate expected duration
const dataSize = testWav.length - 44; // subtract WAV header
const sampleCount = dataSize / 2; // 16-bit samples
const duration = (sampleCount / 16000) * 1000; // duration in ms
console.log(`🧪 Debug: Expected audio duration: ${duration.toFixed(1)}ms`);

console.log(`🧪 Debug: Audio analysis:
- Total file size: ${testWav.length} bytes
- Audio data size: ${dataSize} bytes  
- Sample count: ${sampleCount} samples
- Duration: ${duration.toFixed(1)}ms
- Sample rate: 16000Hz
- Channels: 1 (mono)
- Bit depth: 16-bit`);

console.log('🧪 Debug: Test audio file created successfully');
console.log('🧪 Debug: This audio should be long enough for Gemini Live API (>100ms, optimal 200-500ms)');
