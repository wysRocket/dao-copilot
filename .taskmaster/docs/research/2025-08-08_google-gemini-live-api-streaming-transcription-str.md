---
title: Research Session
query: "Google Gemini Live API streaming transcription (StreamGenerateContent) best practices to minimize latency and reduce word drops: recommended audio format and frame sizes; whether inputTranscription is preferred; typical frame overlap; AudioWorklet vs MediaRecorder; handling turnComplete; responseModalities; using input audio format mime type audio/pcm;rate=16000; channels=1; known pitfalls and rate limits; buffering and WebSocket backpressure; examples."
date: 8/8/2025
time: 12:08:37 PM
timestamp: 2025-08-08T09:08:37.908Z
exchanges: 1
---

# Research Session

## Initial Query

**Question:** Google Gemini Live API streaming transcription (StreamGenerateContent) best practices to minimize latency and reduce word drops: recommended audio format and frame sizes; whether inputTranscription is preferred; typical frame overlap; AudioWorklet vs MediaRecorder; handling turnComplete; responseModalities; using input audio format mime type audio/pcm;rate=16000; channels=1; known pitfalls and rate limits; buffering and WebSocket backpressure; examples.

**Response:**

Certainly! I'll provide a comprehensive analysis of Google Gemini Live API streaming transcription best practices, focusing on minimizing latency and reducing word drops. I'll tailor the response to your project context, particularly considering the implementation in `RealTimeTranscriptionService` and `useRealTimeTranscription` hook.

# Google Gemini Live API Streaming Transcription Best Practices

## 1. Audio Format and Frame Sizes

### Recommended Audio Format
- **Sample Rate**: 16 kHz (as used in your implementation)
- **Channels**: Mono (1 channel)
- **Bit Depth**: 16-bit PCM
- **Encoding**: Linear PCM (little-endian)

### Frame Sizes
- **Optimal Frame Duration**: 20-30 ms
  - Your implementation uses 20 ms (`frameDurationMs = 20`), which is excellent for low latency
- **Samples per Frame**: 320-480 samples at 16 kHz
  - Your code uses 320 samples (`samplesPerFrame = Math.floor((16000 * 20) / 1000)`)

### Frame Overlap
- **Recommended Overlap**: 5-10 ms
- Your implementation uses 10 ms overlap (`overlapMs = 10`), which is ideal
- Overlap helps prevent word drops at frame boundaries

## 2. inputTranscription vs. modelTurn

### Preference for inputTranscription
- The Gemini Live API often provides transcriptions in two formats:
  1. `inputTranscription`
  2. `modelTurn.parts[].text`

- Your implementation correctly prioritizes `inputTranscription`:

```typescript
if (it && typeof it === 'object') {
  const rec = it as Record<string, unknown>
  if (typeof rec.text === 'string') textCandidate = rec.text
  else if (
    rec.transcription &&
    typeof (rec.transcription as Record<string, unknown>).text === 'string'
  ) {
    textCandidate = (rec.transcription as Record<string, unknown>).text as string
  }
}
```

- This approach is optimal as `inputTranscription` often provides more accurate and timely results

## 3. AudioWorklet vs MediaRecorder

### AudioWorklet Preference
- Your implementation correctly prioritizes AudioWorklet:

```typescript
try {
  await this.audioContext.audioWorklet.addModule(
    new URL('./workers/audio-streaming-worklet.js', import.meta.url)
  )
  this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-streaming-processor', {
    processorOptions: {
      bufferSize: 512,
      sampleRate: this.audioContext.sampleRate
    }
  })
  // ... (AudioWorklet setup)
  workletReady = true
} catch (err) {
  console.warn('AudioWorklet not available, using ScriptProcessor fallback:', err)
}
```

- AudioWorklet provides lower jitter and more consistent audio processing compared to ScriptProcessor or MediaRecorder

### ScriptProcessor Fallback
- Your fallback to ScriptProcessor is a good practice for broader browser compatibility:

```typescript
if (!workletReady) {
  const bufferSize = 1024
  this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)
  // ... (ScriptProcessor setup)
}
```

## 4. Handling turnComplete

Your implementation correctly handles the `turnComplete` flag:

```typescript
const isFinal = !!content.turnComplete
const chunk: TranscriptionChunk = {
  text: textCandidate.trim(),
  isFinal,
  confidence: 0.9,
  timestamp: performance.now()
}
this.emit('transcription', chunk)
```

Best practices for handling `turnComplete`:
1. Treat it as a signal to finalize the current transcription segment
2. Clear any interim buffers
3. Start a new transcription segment

## 5. responseModalities

Your configuration correctly specifies `responseModalities`:

```typescript
responseModalities: ['TEXT'],
```

This ensures that the API only returns text transcriptions, reducing unnecessary data transfer and processing.

## 6. Audio MIME Type

Your implementation uses the correct MIME type for PCM audio:

```typescript
createAudioMimeType(this.targetSampleRate)
```

Which likely returns: `audio/pcm;rate=16000;channels=1`

This is the optimal format for Gemini Live API.

## 7. Known Pitfalls and Rate Limits

### Pitfalls
1. **Word Drops at Frame Boundaries**: Your overlap implementation helps mitigate this
2. **Delayed Start of Transcription**: Implement voice activity detection (VAD) to start streaming only when speech is detected
3. **Inconsistent Partial Results**: Implement robust partial result accumulation (which you've done)

### Rate Limits
- Gemini Live API rate limits are not publicly documented
- Implement exponential backoff for reconnections (which you've done)
- Monitor `429 Too Many Requests` errors and adjust accordingly

## 8. Buffering and WebSocket Backpressure

Your implementation includes smart buffering:

```typescript
private pendingAudio: string[] = [] // base64 encoded PCM frames

private async flushPendingAudio(): Promise<void> {
  if (!this.pendingAudio.length) return
  const buffered = [...this.pendingAudio]
  this.pendingAudio = []
  try {
    for (const base64 of buffered) {
      await this.sendPcmBase64(base64)
    }
  } catch (e) {
    console.warn('Failed flushing pending audio:', e)
  }
}
```

To further optimize:
1. Implement a sliding window buffer to limit memory usage
2. Use `WebSocket.bufferedAmount` to check for backpressure before sending
3. Implement adaptive frame rates based on network conditions

## 9. Optimizations for Your Project

Based on your project context, consider these optimizations:

1. **Latency Optimization in `useRealTimeTranscription`**:
   - Implement a more aggressive partial result display strategy
   - Use `requestAnimationFrame` for smoother UI updates

2. **Error Handling and Reconnection**:
   - Enhance the reconnection logic in `RealTimeTranscriptionService`
   - Implement more granular error types and recovery strategies

3. **Performance Monitoring**:
   - Add detailed performance metrics (e.g., audio capture latency, WebSocket latency)
   - Implement client-side logging for easier debugging

4. **Adaptive Quality**:
   - Dynamically adjust frame size and overlap based on network conditions and CPU usage

5. **Voice Activity Detection (VAD)**:
   - Implement client-side VAD to reduce unnecessary data transmission during silence

6. **Robust Partial Result Accumulation**:
   - Enhance your merging logic to handle more edge cases:

```typescript
function mergeWithOverlap(a: string, b: string): string {
  // ... (existing implementation)
  
  // Add more sophisticated merging logic here
  // e.g., word-level matching, handling of punctuation, etc.
}
```

7. **WebWorker for Audio Processing**:
   - Offload audio processing to a WebWorker to improve main thread performance

8. **Optimized State Management**:
   - Consider using a more efficient state management solution (e.g., Jotai or Recoil) for real-time updates

## 10. Example: Enhanced Audio Processing

Here's an example of how you might enhance your audio processing pipeline:

```typescript
class EnhancedAudioProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array = new Float32Array(1600); // 100ms at 16kHz
  private bufferIndex = 0;
  private vad: VAD; // Voice Activity Detector

  constructor() {
    super();
    this.vad = new VAD(); // Implement or use a library
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0][0];
    if (!input) return true;

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.bufferIndex] = input[i];
      this.bufferIndex++;

      if (this.bufferIndex === this.buffer.length) {
        if (this.vad.isSpeechDetected(this.buffer)) {
          this.port.postMessage({
            type: 'audioData',
            audioData: this.buffer.slice(),
            isSpeech: true
          });
        }
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('enhanced-audio-processor', EnhancedAudioProcessor);
```

This enhanced processor includes voice activity detection and more efficient buffering.

## Conclusion

Your current implementation in `RealTimeTranscriptionService` and `useRealTimeTranscription` is already quite robust and follows many best practices. By implementing some of the suggested optimizations, particularly in areas of error handling, performance monitoring, and adaptive processing, you can further reduce latency and improve the overall reliability of your real-time transcription system.

Remember to thoroughly test any changes, especially under varying network conditions and with different audio inputs, to ensure consistent performance across all scenarios.


---

*Generated by Task Master Research Command*  
*Timestamp: 2025-08-08T09:08:37.908Z*
