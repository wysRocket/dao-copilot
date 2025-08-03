# Migration Plan: Recursive to Iterative Audio Processing

## Overview
This document outlines the step-by-step migration from recursive audio processing patterns to iterative processing using the new `AudioChunkProcessor` and `WebSocketTranscriptionAdapter` classes.

## Current Recursive Architecture

### Problem Areas Identified
1. **transcribeAudio() → transcribeAudioViaWebSocket() → performTranscription()** 
   - Deep call stack accumulation
   - Memory consumption increases with each recursive call
   - Stack overflow occurs with large audio files or error retry scenarios

2. **Error Handling Recursion**
   - Failed transcription attempts trigger recursive retries
   - WebSocket reconnection attempts accumulate stack frames
   - Event handler callbacks create indirect recursion

3. **Memory-Intensive Operations**
   - Large audio buffer processing in synchronized chunks
   - Multiple base64 encoding operations
   - Event listener accumulation without proper cleanup

## New Iterative Architecture

### Core Components

#### 1. AudioChunkProcessor
- **Purpose**: Iterative audio chunk processing without recursion
- **Key Features**:
  - Event-driven architecture with proper cleanup
  - Controlled concurrency (max 2-3 concurrent chunks)
  - Memory-efficient streaming with configurable chunk sizes
  - Retry logic using iterative loops instead of recursive calls
  - Built-in cancellation and timeout handling

#### 2. WebSocketTranscriptionAdapter
- **Purpose**: Integration layer between AudioChunkProcessor and WebSocket API
- **Key Features**:
  - Drop-in replacement for recursive transcription functions
  - Event-based chunk processing
  - Proper WebSocket lifecycle management
  - Enhanced error handling without stack accumulation

## Migration Strategy

### Phase 1: Parallel Implementation (SAFE)
1. Keep existing recursive functions intact
2. Implement new iterative classes alongside
3. Add feature flag to switch between implementations
4. Extensive testing with both approaches

### Phase 2: Gradual Replacement (CONTROLLED)
1. Replace non-critical transcription calls first
2. Monitor performance and error rates
3. Gradually increase usage of iterative implementation
4. Keep fallback to recursive implementation

### Phase 3: Full Migration (FINAL)
1. Replace all recursive transcription calls
2. Remove recursive implementation code
3. Clean up deprecated functions and imports
4. Update documentation and type definitions

## Implementation Steps

### Step 1: Create Feature Flag System
```typescript
// Add to transcription options
interface TranscriptionOptions {
  useIterativeProcessing?: boolean
  // ... existing options
}
```

### Step 2: Update Main Transcription Entry Point
```typescript
export async function transcribeAudio(
  wavData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  if (options.useIterativeProcessing) {
    // Use new iterative implementation
    return transcribeAudioViaWebSocketIterative(wavData, options)
  } else {
    // Use existing recursive implementation (fallback)
    return transcribeAudioViaWebSocket(wavData, options)
  }
}
```

### Step 3: Integration Points
1. **main-stt-transcription.ts**:
   - Add import for WebSocketTranscriptionAdapter
   - Implement feature flag logic
   - Update function signatures if needed

2. **Error Handling**:
   - Update TranscriptionError types to include iteration metrics
   - Enhance error reporting for chunk-level failures
   - Add monitoring for iterative processing performance

3. **Performance Monitoring**:
   - Track chunk processing metrics
   - Monitor memory usage patterns
   - Compare recursive vs iterative performance

### Step 4: Testing Strategy
1. **Unit Tests**:
   - AudioChunkProcessor with various chunk sizes
   - WebSocketTranscriptionAdapter mock scenarios
   - Error handling and retry logic

2. **Integration Tests**:
   - End-to-end transcription with iterative processing
   - WebSocket connection scenarios
   - Large audio file processing

3. **Performance Tests**:
   - Memory usage monitoring
   - Stack depth measurement
   - Concurrent processing limits

4. **Stress Tests**:
   - Continuous audio processing
   - Simulated network failures
   - High-frequency transcription requests

## Configuration Options

### AudioChunkProcessor Settings
```typescript
const processorOptions = {
  chunkSize: 32 * 1024,      // 32KB chunks for WebSocket
  maxConcurrentChunks: 2,    // Lower concurrency for stability
  processingDelay: 150,      // Throttling between chunks
  retryAttempts: 1,          // Reduced retries for WebSocket
  retryDelay: 500            // Quick retry for network issues
}
```

### WebSocket Adapter Settings
```typescript
const adapterOptions = {
  connectionTimeout: 10000,   // 10 second connection timeout
  chunkTimeout: 5000,        // 5 second per-chunk timeout
  maxReconnectAttempts: 2,   // Limited reconnection attempts
  reconnectDelay: 1000       // 1 second between reconnections
}
```

## Monitoring and Rollback Plan

### Success Metrics
- Stack overflow errors eliminated
- Memory usage remains stable during long sessions
- Transcription accuracy maintained or improved
- Performance meets or exceeds current implementation

### Failure Indicators
- Increased transcription errors
- Performance degradation
- Memory leaks in iterative processing
- WebSocket connection instability

### Rollback Procedure
1. Set feature flag to disable iterative processing
2. Revert to recursive implementation immediately
3. Analyze logs and error reports
4. Fix issues and re-test before re-enabling

## Benefits of Migration

### Immediate Benefits
- **Stack Overflow Prevention**: Eliminates recursive call depth issues
- **Memory Efficiency**: Controlled memory usage with chunk processing
- **Better Error Handling**: Granular error recovery at chunk level
- **Improved Monitoring**: Detailed metrics for audio processing pipeline

### Long-term Benefits
- **Scalability**: Can handle larger audio files without stack limits
- **Maintainability**: Clearer separation of concerns
- **Performance**: Optimized chunk processing and concurrency control
- **Reliability**: More robust error handling and recovery

## Risk Assessment

### Low Risk
- Parallel implementation maintains existing functionality
- Feature flag allows immediate rollback
- Extensive testing before full migration

### Medium Risk
- WebSocket integration complexity
- Performance differences between implementations
- Potential for new types of errors

### Mitigation Strategies
- Comprehensive testing suite
- Gradual rollout with monitoring
- Detailed logging and error reporting
- Clear rollback procedures

## Success Criteria

1. **Functional**: All existing transcription features work with iterative implementation
2. **Performance**: Memory usage stable, latency maintained or improved
3. **Reliability**: Stack overflow errors eliminated, error rates not increased
4. **Maintainability**: Code is cleaner and easier to understand
5. **Monitoring**: Better visibility into transcription pipeline performance

## Timeline

- **Week 1**: Implement feature flag system and parallel testing
- **Week 2**: Integration testing and performance validation
- **Week 3**: Gradual rollout with monitoring
- **Week 4**: Full migration and cleanup of recursive code

This migration plan ensures a safe, controlled transition from recursive to iterative audio processing while maintaining system reliability and performance.
