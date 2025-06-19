/**
 * Audio Streaming WorkletProcessor
 *
 * High-performance audio processing worklet for real-time streaming.
 * Runs in the Audio Worklet thread for minimal latency.
 */

class AudioStreamingProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    this.bufferSize = options.processorOptions?.bufferSize || 4096
    this.sampleRate = options.processorOptions?.sampleRate || 16000

    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0

    // Performance monitoring
    this.processedFrames = 0
    this.lastReportTime = currentTime
  }

  process(inputs) {
    const input = inputs[0]

    if (input.length === 0) {
      return true
    }

    const inputChannel = input[0]

    // Process input audio in chunks
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex] = inputChannel[i]
      this.bufferIndex++

      // When buffer is full, send it to main thread
      if (this.bufferIndex >= this.bufferSize) {
        this.sendAudioData()
        this.bufferIndex = 0
      }
    }

    this.processedFrames += inputChannel.length

    // Send performance report every second
    if (currentTime - this.lastReportTime >= 1.0) {
      this.port.postMessage({
        type: 'performance',
        data: {
          processedFrames: this.processedFrames,
          sampleRate: this.sampleRate,
          bufferSize: this.bufferSize,
          timestamp: currentTime
        }
      })

      this.processedFrames = 0
      this.lastReportTime = currentTime
    }

    return true
  }

  sendAudioData() {
    // Create a copy of the buffer to send
    const audioData = new Float32Array(this.buffer)

    this.port.postMessage({
      type: 'audioData',
      audioData: audioData,
      timestamp: currentTime,
      sampleRate: this.sampleRate
    })
  }
}

// Register the processor
registerProcessor('audio-streaming-processor', AudioStreamingProcessor)
