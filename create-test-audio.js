// Create a longer test audio sample for transcription testing
// This simulates about 2 seconds of audio data with some variation

const fs = require('fs');
const path = require('path');

function createTestAudioWav(durationSeconds = 2, sampleRate = 16000) {
  const numSamples = durationSeconds * sampleRate;
  const bytesPerSample = 2; // 16-bit
  const channels = 1;
  
  // Create WAV header
  const dataSize = numSamples * bytesPerSample * channels;
  const fileSize = 36 + dataSize;
  
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample * channels, 28); // byte rate
  header.writeUInt16LE(bytesPerSample * channels, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  // Create audio data that simulates speech-like patterns
  const audioData = Buffer.alloc(dataSize);
  for (let i = 0; i < numSamples; i++) {
    // Create a more complex waveform that resembles speech
    const t = i / sampleRate;
    const frequency1 = 440 + Math.sin(t * 2) * 100; // Varying frequency around 440Hz
    const frequency2 = 880 + Math.cos(t * 3) * 150; // Harmonic with variation
    
    // Combine frequencies with envelope
    const envelope = Math.sin(t * Math.PI * 2) * Math.exp(-t * 0.5);
    const sample1 = Math.sin(2 * Math.PI * frequency1 * t) * envelope * 0.3;
    const sample2 = Math.sin(2 * Math.PI * frequency2 * t) * envelope * 0.2;
    const finalSample = (sample1 + sample2) * 16000; // Scale for 16-bit
    
    // Clamp to 16-bit range
    const clampedSample = Math.max(-32768, Math.min(32767, Math.round(finalSample)));
    audioData.writeInt16LE(clampedSample, i * 2);
  }
  
  return Buffer.concat([header, audioData]);
}

// Create test audio files of different lengths
const testFiles = [
  { name: 'test-audio-2sec.wav', duration: 2 },
  { name: 'test-audio-3sec.wav', duration: 3 },
];

console.log('🎵 Creating test audio files...');

testFiles.forEach(({ name, duration }) => {
  const audioBuffer = createTestAudioWav(duration, 16000);
  const filePath = path.join(__dirname, name);
  fs.writeFileSync(filePath, audioBuffer);
  console.log(`✅ Created ${name}: ${audioBuffer.length} bytes (${duration}s at 16kHz)`);
});

console.log('\n💡 These files contain synthetic speech-like audio that should be long enough for transcription');
console.log('💡 Try using one of these files in your transcription tests');
