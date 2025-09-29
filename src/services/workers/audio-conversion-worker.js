// Audio Conversion Worker
// Handles audio format conversion in a separate thread to avoid blocking the main UI

self.addEventListener('message', async event => {
  const {type, data, id} = event.data

  try {
    switch (type) {
      case 'CONVERT_AUDIO_FORMAT':
        const result = await convertAudioFormat(data)
        self.postMessage({
          type: 'CONVERSION_COMPLETE',
          id,
          result
        })
        break

      case 'CONVERT_TO_WAV':
        const wavResult = await convertToWav(data)
        self.postMessage({
          type: 'WAV_CONVERSION_COMPLETE',
          id,
          result: wavResult
        })
        break

      default:
        self.postMessage({
          type: 'ERROR',
          id,
          error: `Unknown conversion type: ${type}`
        })
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error.message
    })
  }
})

async function convertAudioFormat(data) {
  const {audioBuffer, targetFormat} = data

  // Basic audio format conversion
  // In a real implementation, you would use proper audio encoding libraries

  if (targetFormat === 'wav') {
    return convertToWav({audioBuffer})
  }

  // For now, return the original buffer
  return audioBuffer
}

async function convertToWav(data) {
  const {audioBuffer} = data

  // Basic WAV conversion
  // This is a simplified implementation
  const numberOfChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length

  // Create a simple WAV header and data
  const buffer = new ArrayBuffer(44 + length * numberOfChannels * 2)
  const view = new DataView(buffer)

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length * numberOfChannels * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true)
  view.setUint16(32, numberOfChannels * 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, length * numberOfChannels * 2, true)

  // Convert audio data
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return buffer
}

// Worker ready signal
self.postMessage({type: 'WORKER_READY'})
