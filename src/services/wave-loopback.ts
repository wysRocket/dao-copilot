/**
 * AudioWorklet processor for real-time audio capture
 * This file runs in the audio worklet thread for low-latency audio processing
 */

interface AudioWorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean
}

declare const AudioWorkletProcessor: {
  prototype: AudioWorkletProcessor
  new (options?: AudioWorkletNodeOptions): AudioWorkletProcessor
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor
): void

class WaveLoopbackProcessor extends AudioWorkletProcessor {
  private buffer: number[] = []
  private bufferSize = 4096 // Send chunks of 4096 samples
  private sampleCount = 0

  constructor() {
    super()
    this.port.postMessage({ type: 'ready' })
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    
    if (input && input.length > 0) {
      const channelData = input[0] // Use first channel
      
      if (channelData) {
        // Add samples to buffer
        for (let i = 0; i < channelData.length; i++) {
          this.buffer.push(channelData[i])
          this.sampleCount++
        }

        // Send buffer when it reaches target size
        if (this.buffer.length >= this.bufferSize) {
          this.port.postMessage({
            type: 'audioData',
            data: [...this.buffer], // Clone array
            sampleCount: this.sampleCount,
            timestamp: Date.now()
          })
          
          this.buffer = []
        }
      }
    }

    return true // Keep processor alive
  }
}

registerProcessor('wave-loopback', WaveLoopbackProcessor)
