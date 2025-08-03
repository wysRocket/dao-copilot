# Migration Guide: Streaming API Implementation

## Overview

This document provides guidance for migrating from the existing WebSocket transcription system to the new streaming-based implementation with comprehensive backpressure control and memory optimization.

## Migration Steps

### 1. Replace Direct WebSocket Calls

**Before (Recursive/Direct WebSocket):**
```typescript
import { transcribeAudioViaWebSocket } from './main-stt-transcription'

// Direct WebSocket call (prone to stack overflow)
const result = await transcribeAudioViaWebSocket(audioBuffer, options)
```

**After (Streaming with Backpressure):**
```typescript
import { StreamingTranscriptionEngine } from './StreamingTranscriptionEngine'

// Streaming approach with built-in backpressure
const engine = new StreamingTranscriptionEngine({
  realTimeProcessing: true,
  backpressureConfig: {
    maxBufferSize: 30,
    maxBufferMemory: 5 * 1024 * 1024 // 5MB
  }
})

// For complete audio processing
const results = await engine.processCompleteAudioStream(audioBuffer)

// For real-time streaming
const session = await engine.startStreamingTranscription('session-1')
await session.addAudioChunk(audioChunk1)
await session.addAudioChunk(audioChunk2, true) // isLast = true
const allResults = session.getResults()
```

### 2. Replace Batch Processing

**Before (Batch with Memory Issues):**
```typescript
// Large batch processing causing memory issues
const results = []
for (const chunk of largeAudioChunks) {
  const result = await transcribeAudioViaWebSocket(chunk)
  results.push(result)
}
```

**After (Stream-based Processing):**
```typescript
// Stream-based processing with automatic memory management
const engine = new StreamingTranscriptionEngine({
  transcriptionConfig: {
    enableMemoryOptimization: true,
    useWebWorkers: true
  }
})

const results: StreamingTranscriptionResult[] = []
for await (const result of engine.processAudioChunksStream(largeAudioBuffer)) {
  results.push(result)
  // Process result immediately - no memory accumulation
  console.log(`Chunk ${result.chunkIndex}: ${result.text}`)
}
```

### 3. Integrate Real-time Event Handling

**Before (Manual Event Management):**
```typescript
// Manual WebSocket event handling
websocket.onmessage = (event) => {
  const result = JSON.parse(event.data)
  // Manual backpressure logic
  if (queue.length > MAX_QUEUE_SIZE) {
    websocket.pause() // Not standard API
  }
}
```

**After (Built-in Event Management):**
```typescript
// Automatic event handling with backpressure
const session = await engine.startStreamingTranscription(
  'session-1',
  (result: StreamingTranscriptionResult) => {
    // Real-time result processing
    console.log(`Real-time: ${result.text}`)
    updateUI(result)
  },
  (error: Error) => {
    // Built-in error handling
    console.error('Transcription error:', error)
  }
)

// Backpressure is handled automatically
const success = await session.addAudioChunk(audioData)
if (!success) {
  console.log('Backpressure active - chunk queued for later processing')
}
```

## Configuration Migration

### Basic Configuration
```typescript
// Old approach
const options = {
  language: 'en-US',
  enablePunctuation: true
}

// New streaming approach
const config: StreamingTranscriptionConfig = {
  // Stream-specific settings
  chunkSize: 32 * 1024,
  maxConcurrentStreams: 3,
  realTimeProcessing: true,
  
  // Backpressure control
  backpressureConfig: {
    maxBufferSize: 30,
    maxBufferMemory: 5 * 1024 * 1024,
    processingDelay: 50,
    adaptiveDelay: true
  },
  
  // Transcription settings
  transcriptionConfig: {
    enableOptimizations: true,
    useWebWorkers: true,
    enableMemoryOptimization: true,
    maxRetries: 3
  }
}
```

### Advanced Configuration for Different Use Cases

**Real-time Speech Recognition:**
```typescript
const realtimeConfig: StreamingTranscriptionConfig = {
  chunkSize: 16 * 1024, // Smaller chunks for lower latency
  realTimeProcessing: true,
  bufferFlushInterval: 500, // 500ms flush interval
  backpressureConfig: {
    maxBufferSize: 15, // Smaller buffer for real-time
    processingDelay: 25, // Faster processing
    adaptiveDelay: true
  }
}
```

**Batch File Processing:**
```typescript
const batchConfig: StreamingTranscriptionConfig = {
  chunkSize: 64 * 1024, // Larger chunks for efficiency
  realTimeProcessing: false,
  maxConcurrentStreams: 5, // More concurrent processing
  backpressureConfig: {
    maxBufferSize: 50, // Larger buffer for batch
    maxBufferMemory: 10 * 1024 * 1024, // 10MB
    processingDelay: 100
  },
  transcriptionConfig: {
    useWebWorkers: true,
    enableMemoryOptimization: true
  }
}
```

## Error Handling Migration

### Before (Manual Error Handling)
```typescript
try {
  const result = await transcribeAudioViaWebSocket(audioData)
  // Manual retry logic
} catch (error) {
  if (error.message.includes('stack overflow')) {
    // Manual stack overflow handling
    return await processInChunks(audioData)
  }
  throw error
}
```

### After (Built-in Error Recovery)
```typescript
const engine = new StreamingTranscriptionEngine({
  transcriptionConfig: {
    maxRetries: 3 // Built-in retry logic
  },
  backpressureConfig: {
    circuitBreakerConfig: {
      failureThreshold: 5,
      recoveryTimeout: 30000
    }
  }
})

// Error handling is built into the streaming system
const session = await engine.startStreamingTranscription(
  'session-1',
  (result) => { /* success handler */ },
  (error) => {
    // Comprehensive error information
    console.error('Transcription failed:', error)
    // Circuit breaker automatically handles recovery
  }
)
```

## Memory Management Migration

### Before (Manual Memory Management)
```typescript
// Manual cleanup and memory monitoring
const processAudio = async (audioData: Buffer) => {
  const chunks = []
  try {
    // Manual chunking
    for (let i = 0; i < audioData.length; i += chunkSize) {
      const chunk = audioData.slice(i, i + chunkSize)
      chunks.push(chunk)
    }
    
    // Manual memory monitoring
    if (process.memoryUsage().heapUsed > MAX_MEMORY) {
      throw new Error('Memory limit exceeded')
    }
    
    // Process chunks
    const results = []
    for (const chunk of chunks) {
      const result = await transcribeChunk(chunk)
      results.push(result)
      // Manual cleanup
      chunk.fill(0)
    }
    
    return results
  } finally {
    // Manual cleanup
    chunks.forEach(chunk => chunk.fill(0))
  }
}
```

### After (Automatic Memory Management)
```typescript
// Automatic memory management with monitoring
const engine = new StreamingTranscriptionEngine({
  transcriptionConfig: {
    enableMemoryOptimization: true, // Object pooling and typed arrays
    useWebWorkers: true // Offload to workers
  },
  backpressureConfig: {
    maxBufferMemory: 5 * 1024 * 1024, // Automatic memory limits
    adaptiveDelay: true // Automatic delay adjustment
  }
})

// Memory is automatically managed
const results = await engine.processCompleteAudioStream(audioData)

// Get memory metrics if needed
const metrics = engine.getGlobalMetrics()
console.log('Memory usage:', metrics.sessionMetrics)
```

## Performance Monitoring Migration

### Before (Manual Metrics)
```typescript
const startTime = Date.now()
let chunkCount = 0

const processWithMetrics = async (audioData: Buffer) => {
  const results = []
  
  for (const chunk of chunks) {
    const chunkStart = Date.now()
    const result = await transcribeChunk(chunk)
    const chunkTime = Date.now() - chunkStart
    
    chunkCount++
    results.push(result)
    
    console.log(`Chunk ${chunkCount} processed in ${chunkTime}ms`)
  }
  
  const totalTime = Date.now() - startTime
  console.log(`Total processing time: ${totalTime}ms`)
  
  return results
}
```

### After (Built-in Metrics)
```typescript
const engine = new StreamingTranscriptionEngine({
  enableMetrics: true // Enable comprehensive metrics
})

const session = await engine.startStreamingTranscription('session-1')

// Process audio
await session.addAudioChunk(audioData1)
await session.addAudioChunk(audioData2, true)

// Get comprehensive metrics
const metrics = session.getMetrics()
console.log('Performance metrics:', {
  readable: metrics.readable,
  writable: metrics.writable,
  transform: metrics.transform
})

// Global metrics across all sessions
const globalMetrics = engine.getGlobalMetrics()
console.log('Global performance:', globalMetrics)
```

## Testing Migration

### Unit Tests
```typescript
// Before - testing individual functions
describe('WebSocket Transcription', () => {
  it('should transcribe audio without stack overflow', async () => {
    const audioData = generateLargeAudioBuffer()
    const result = await transcribeAudioViaWebSocket(audioData)
    expect(result.text).toBeDefined()
  })
})

// After - testing streaming components
describe('Streaming Transcription', () => {
  it('should handle large audio streams with backpressure', async () => {
    const engine = new StreamingTranscriptionEngine()
    const audioData = generateLargeAudioBuffer()
    
    const results = await engine.processCompleteAudioStream(audioData)
    expect(results).toHaveLength(Math.ceil(audioData.length / 32768))
    
    const metrics = engine.getGlobalMetrics()
    expect(metrics.activeSessions).toBe(0) // Should be cleaned up
  })
  
  it('should handle backpressure correctly', async () => {
    const engine = new StreamingTranscriptionEngine({
      backpressureConfig: { maxBufferSize: 2 }
    })
    
    const session = await engine.startStreamingTranscription('test')
    
    // Fill buffer beyond capacity
    const success1 = await session.addAudioChunk(generateAudioChunk())
    const success2 = await session.addAudioChunk(generateAudioChunk())
    const success3 = await session.addAudioChunk(generateAudioChunk()) // Should trigger backpressure
    
    expect(success1).toBe(true)
    expect(success2).toBe(true)
    expect(success3).toBe(false) // Backpressure activated
  })
})
```

## Rollback Strategy

If issues arise during migration, you can implement a feature flag approach:

```typescript
const USE_STREAMING_API = process.env.USE_STREAMING_TRANSCRIPTION === 'true'

const transcribeAudio = async (audioData: Buffer, options: any) => {
  if (USE_STREAMING_API) {
    // New streaming approach
    const engine = new StreamingTranscriptionEngine(options)
    const results = await engine.processCompleteAudioStream(audioData)
    return { text: results.map(r => r.text).join(' '), confidence: 0.8 }
  } else {
    // Fallback to original approach
    return await transcribeAudioViaWebSocket(audioData, options)
  }
}
```

## Best Practices

1. **Start with Small Streams**: Begin migration with smaller audio files and gradually increase size
2. **Monitor Memory Usage**: Use the built-in metrics to monitor memory consumption
3. **Configure Backpressure**: Adjust backpressure settings based on your specific use case
4. **Test Error Scenarios**: Ensure error handling works correctly with circuit breaker patterns
5. **Performance Tuning**: Use adaptive settings and monitor metrics to optimize performance

## Troubleshooting

### Common Issues and Solutions

**Issue**: High memory usage even with streaming
**Solution**: Reduce `chunkSize` and `maxBufferMemory` in configuration

**Issue**: Processing too slow
**Solution**: Increase `maxConcurrentStreams` and enable `useWebWorkers`

**Issue**: Backpressure activating too frequently
**Solution**: Increase `maxBufferSize` or reduce `processingDelay`

**Issue**: Circuit breaker opening repeatedly
**Solution**: Check audio data quality and adjust `failureThreshold`

This migration guide ensures a smooth transition from recursive WebSocket processing to the new streaming architecture with comprehensive backpressure control and memory optimization.
