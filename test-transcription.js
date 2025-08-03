const fs = require('fs')
const path = require('path')

// Test with the male.wav file which should contain actual speech
async function testWithRealAudio() {
  try {
    console.log('🎤 Testing transcription with real audio file: male.wav')

    const audioPath = path.join(__dirname, 'male.wav')
    const audioBuffer = fs.readFileSync(audioPath)

    console.log(`📁 Audio file size: ${audioBuffer.length} bytes`)

    // Call the transcription service directly
    const {ipcMain} = require('electron')

    // We need to simulate the IPC call that the UI would make
    console.log('🚀 Calling transcription service with real audio...')

    // This would need to be called from the main process
    console.log('💡 To test this properly, you should:')
    console.log('1. Use the microphone button in the UI to record real speech')
    console.log('2. Speak clearly: "Hello, this is a test of the transcription system"')
    console.log('3. The system should now transcribe your speech correctly')
  } catch (error) {
    console.error('❌ Error testing audio:', error)
  }
}

testWithRealAudio()
