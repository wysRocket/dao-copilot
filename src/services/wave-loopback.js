class WaveLoopback extends AudioWorkletProcessor {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  process(inputs, _outputs, _parameters) {
    this.pushData(inputs[0][0]);

    // Only send data when we have accumulated enough samples
    // Target: 300-500ms chunks for optimal Gemini Live API performance
    // At 44.1kHz: 300ms = 13,230 samples, 500ms = 22,050 samples
    // Using 22,050 samples (500ms) for optimal API performance
    if (this.buffer.length >= this.targetBufferSize) {
      this.port.postMessage([...this.buffer]); // Send copy of buffer
      this.buffer = []; // Clear the buffer
    }

    return true;
  }

  pushData(samples) {
    if (!samples) return;
    
    for (var i = 0; i < samples.length; i++) {
      this.buffer.push(samples[i]);
    }
  }

  constructor(options) {
    super();
    this.buffer = [];
    
    // Default to 500ms chunks at 44.1kHz sample rate
    // This will be ~22,050 samples for optimal Gemini Live API performance
    const sampleRate = options?.processorOptions?.sampleRate || 44100;
    const targetDurationMs = options?.processorOptions?.targetDurationMs || 500;
    
    this.targetBufferSize = Math.floor((sampleRate * targetDurationMs) / 1000);
    
    console.log(`AudioWorklet initialized: targetBufferSize=${this.targetBufferSize} samples (${targetDurationMs}ms at ${sampleRate}Hz)`);
  }
}

registerProcessor('wave-loopback', WaveLoopback);
