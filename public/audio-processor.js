/**
 * Audio Processor Worklet
 *
 * High-performance audio processing worklet for real-time audio streaming.
 * Runs in a separate thread to avoid blocking the main UI thread.
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    // Extract configuration from processor options
    const processorOptions = options.processorOptions || {}
    this.sampleRate = processorOptions.sampleRate || 16000
    this.channels = processorOptions.channels || 1
    this.chunkSize = processorOptions.chunkSize || 4096
    this.enableVAD = processorOptions.enableVAD || false
    this.vadThreshold = processorOptions.vadThreshold || 0.01
    this.enableNoiseSuppression = processorOptions.enableNoiseSuppression || false

    // Initialize buffers
    this.buffer = []
    for (let i = 0; i < this.channels; i++) {
      this.buffer[i] = new Float32Array(this.chunkSize)
    }
    this.bufferIndex = 0
    this.chunkCounter = 0

    // Initialize VAD
    this.vadHistory = []
    this.vadHistorySize = 10

    // Initialize noise suppression
    this.isLearningNoise = true
    this.noiseLearningSamples = this.sampleRate * 2 // Learn for 2 seconds
    this.noiseProfile = null

    // Set up message handling
    this.port.onmessage = this.handleMessage.bind(this)

    // Log initialization (Web Audio worklet has console access)
    // eslint-disable-next-line no-console
    console.log('Audio Processor Worklet initialized', {
      sampleRate: this.sampleRate,
      channels: this.channels,
      chunkSize: this.chunkSize,
      enableVAD: this.enableVAD,
      enableNoiseSuppression: this.enableNoiseSuppression
    })
  }

  /**
   * Process audio data (called by Web Audio API)
   */
  process(inputs, outputs) {
    const input = inputs[0]
    const output = outputs[0]

    if (!input || input.length === 0) {
      return true
    }

    const inputChannel = input[0]
    const frameCount = inputChannel.length

    // Process each frame
    for (let i = 0; i < frameCount; i++) {
      // Add sample to buffer
      for (let channel = 0; channel < this.channels; channel++) {
        const channelData = input[channel] || inputChannel
        this.buffer[channel][this.bufferIndex] = channelData[i]
      }

      this.bufferIndex++

      // Check if buffer is full
      if (this.bufferIndex >= this.chunkSize) {
        this.processChunk()
        this.bufferIndex = 0
      }
    }

    // Copy input to output (pass-through)
    if (output && output.length > 0) {
      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
        if (output[channel]) {
          output[channel].set(input[channel])
        }
      }
    }

    return true
  }

  /**
   * Process a complete audio chunk
   */
  processChunk() {
    try {
      // Create a copy of the current buffer
      const processedData = new Float32Array(this.chunkSize)
      processedData.set(this.buffer[0])

      // Apply noise suppression if enabled
      if (this.enableNoiseSuppression) {
        this.applyNoiseSuppression(processedData)
      }

      // Apply voice activity detection if enabled
      let vadActive = true
      if (this.enableVAD) {
        vadActive = this.detectVoiceActivity(processedData)
      }

      // Only send chunk if VAD is active or VAD is disabled
      if (vadActive || !this.enableVAD) {
        this.sendProcessedChunk(processedData, vadActive)
      }

      this.chunkCounter++
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error processing audio chunk:', error)
    }
  }

  /**
   * Apply noise suppression using spectral subtraction
   */
  applyNoiseSuppression(data) {
    // Simple noise suppression implementation
    // In a production environment, you'd use more sophisticated algorithms

    if (this.isLearningNoise && this.noiseLearningSamples > 0) {
      // Learn noise profile from initial samples
      this.learnNoiseProfile(data)
      this.noiseLearningSamples -= data.length

      if (this.noiseLearningSamples <= 0) {
        this.isLearningNoise = false
        // eslint-disable-next-line no-console
        console.log('Noise learning complete')
      }
      return
    }

    if (!this.noiseProfile) {
      return
    }

    // Apply basic spectral subtraction
    const alpha = 0.5 // Suppression factor

    for (let i = 0; i < data.length; i++) {
      const noiseLevel = this.noiseProfile[i % this.noiseProfile.length]
      const signalLevel = Math.abs(data[i])

      if (signalLevel > noiseLevel * 2) {
        // Signal is significantly above noise floor - keep it
        continue
      } else if (signalLevel > noiseLevel) {
        // Signal is slightly above noise floor - reduce it
        data[i] *= 1 - alpha * 0.5
      } else {
        // Signal is at or below noise floor - suppress heavily
        data[i] *= 1 - alpha
      }
    }
  }

  /**
   * Learn noise profile from initial audio samples
   */
  learnNoiseProfile(data) {
    if (!this.noiseProfile) {
      this.noiseProfile = new Float32Array(data.length)
      this.noiseProfile.set(data.map(x => Math.abs(x)))
    } else {
      // Average with existing noise profile
      for (let i = 0; i < Math.min(data.length, this.noiseProfile.length); i++) {
        this.noiseProfile[i] = (this.noiseProfile[i] + Math.abs(data[i])) / 2
      }
    }
  }

  /**
   * Detect voice activity using energy-based detection
   */
  detectVoiceActivity(data) {
    // Calculate RMS energy
    let energy = 0
    for (let i = 0; i < data.length; i++) {
      energy += data[i] * data[i]
    }
    energy = Math.sqrt(energy / data.length)

    // Add to VAD history
    this.vadHistory.push(energy)
    if (this.vadHistory.length > this.vadHistorySize) {
      this.vadHistory.shift()
    }

    // Calculate average energy over history
    const avgEnergy = this.vadHistory.reduce((a, b) => a + b, 0) / this.vadHistory.length

    // Voice activity is detected if current energy is above threshold
    // and significantly above recent average
    const isActive = energy > this.vadThreshold && energy > avgEnergy * 1.5

    return isActive
  }

  /**
   * Send processed audio chunk to main thread
   */
  sendProcessedChunk(data, vadActive) {
    // Convert Float32Array to ArrayBuffer for transfer
    const buffer = new ArrayBuffer(data.length * 4)
    const view = new Float32Array(buffer)
    view.set(data)

    // Calculate quality metrics
    const quality = this.calculateChunkQuality(data, vadActive)

    // Send to main thread
    this.port.postMessage(
      {
        type: 'audioChunk',
        data: {
          id: `worklet_${this.chunkCounter}_${Date.now()}`,
          data: buffer,
          timestamp: currentTime * 1000, // Convert to milliseconds
          duration: (data.length / this.sampleRate) * 1000,
          sampleRate: this.sampleRate,
          channels: this.channels,
          size: buffer.byteLength,
          vadActive,
          quality
        }
      },
      [buffer]
    ) // Transfer ownership of buffer
  }

  /**
   * Calculate quality score for the audio chunk
   */
  calculateChunkQuality(data, vadActive) {
    let quality = 100

    // Calculate signal-to-noise ratio
    let signal = 0
    let noise = 0

    for (let i = 0; i < data.length; i++) {
      const sample = Math.abs(data[i])
      if (sample > this.vadThreshold) {
        signal += sample
      } else {
        noise += sample
      }
    }

    const snr = signal > 0 && noise > 0 ? signal / noise : 100

    // Adjust quality based on SNR
    if (snr < 2) {
      quality -= 30
    } else if (snr < 5) {
      quality -= 15
    } else if (snr < 10) {
      quality -= 5
    }

    // Adjust quality based on VAD
    if (this.enableVAD && !vadActive) {
      quality -= 20 // Lower quality for non-voice segments
    }

    // Check for clipping
    const maxSample = Math.max(...data.map(x => Math.abs(x)))
    if (maxSample > 0.95) {
      quality -= 25 // Penalize clipping
    }

    return Math.max(0, Math.min(100, quality))
  }

  /**
   * Handle messages from main thread
   */
  handleMessage(event) {
    const {type, data} = event.data

    switch (type) {
      case 'updateConfig':
        this.updateConfiguration(data)
        break
      case 'resetNoiseProfile':
        this.resetNoiseProfile()
        break
      case 'getStats':
        this.sendStats()
        break
      default:
        // eslint-disable-next-line no-console
        console.warn('Unknown message type:', type)
    }
  }

  /**
   * Update worklet configuration
   */
  updateConfiguration(config) {
    if (config.vadThreshold !== undefined) {
      this.vadThreshold = config.vadThreshold
    }
    if (config.enableVAD !== undefined) {
      this.enableVAD = config.enableVAD
    }
    if (config.enableNoiseSuppression !== undefined) {
      this.enableNoiseSuppression = config.enableNoiseSuppression
    }

    // eslint-disable-next-line no-console
    console.log('Worklet configuration updated:', config)
  }

  /**
   * Reset noise profile for relearning
   */
  resetNoiseProfile() {
    this.noiseProfile = null
    this.isLearningNoise = true
    this.noiseLearningSamples = this.sampleRate * 2
    // eslint-disable-next-line no-console
    console.log('Noise profile reset')
  }

  /**
   * Send processing statistics to main thread
   */
  sendStats() {
    const stats = {
      chunksProcessed: this.chunkCounter,
      vadHistoryLength: this.vadHistory.length,
      isLearningNoise: this.isLearningNoise,
      hasNoiseProfile: !!this.noiseProfile,
      bufferIndex: this.bufferIndex,
      currentTime: currentTime
    }

    this.port.postMessage({
      type: 'stats',
      data: stats
    })
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor)
