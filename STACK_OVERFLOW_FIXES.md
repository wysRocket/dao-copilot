# WebSocket Transcription Stack Overflow Fixes

## Problem Summary
The WebSocket transcription system was experiencing "Maximum call stack size exceeded" errors due to infinite recursion in the `performTranscription` and `transcribeAudioViaWebSocket` functions.

## Root Causes Identified

### 1. Recursive Function Calls
- **Issue**: Direct recursion in transcription functions without proper depth limits
- **Location**: `src/services/main-stt-transcription.ts`
- **Fix**: Added call depth tracking with maximum depth protection and duplicate call detection

### 2. Event Bridge Feedback Loops  
- **Issue**: The `GeminiTranscriptionBridge` was calling `simulateTranscription()` which could trigger new transcription requests
- **Location**: `src/services/gemini-transcription-bridge.ts`
- **Fix**: Replaced simulation method with direct broadcasting to break recursion chain

### 3. Callback Chain Recursion
- **Issue**: onTranscription callbacks in audio processing could trigger new transcription requests
- **Location**: `src/services/enhanced-audio-recording.ts`
- **Fix**: Added re-entry protection and callback safety wrappers

### 4. State Manager Listener Loops
- **Issue**: State change listeners could trigger events that caused more state changes
- **Location**: `src/state/TranscriptionStateManager.ts`
- **Fix**: Added listener notification recursion protection

## Comprehensive Error Handling System

⚠️ **Enhanced Error Handling**: A comprehensive error handling system has been implemented to prevent and manage stack overflow errors. See `ERROR_HANDLING_GUIDE.md` for complete documentation.

### New Error Types
- `StackOverflowError` - Recursive function call detection
- `RecursiveCallError` - Duplicate call protection  
- `WebSocketConnectionError` - Connection failure handling
- `AudioProcessingError` - Audio processing failures
- `CircuitBreakerError` - System overload protection

### Error Recovery
- Automatic retry with exponential backoff
- Circuit breaker pattern implementation
- Graceful degradation strategies
- Comprehensive error reporting and metrics

## Implemented Fixes

### 1. Call Depth Protection (main-stt-transcription.ts)
```typescript
// Enhanced stack overflow protection with call tracking
const MAX_CALL_DEPTH = 3 // Reduced from 5 for stricter protection
const recentCalls = new Map<string, number>() // Track recent calls by audio hash
const CALL_COOLDOWN_MS = 1000 // Minimum time between identical calls

// Enhanced error handling with specific error types
if (transcriptionCallDepth > MAX_CALL_DEPTH) {
  const error = new StackOverflowError(
    `Stack overflow protection: Maximum call depth ${MAX_CALL_DEPTH} exceeded`,
    transcriptionCallDepth,
    MAX_CALL_DEPTH,
    { callId, callStack: [...callStack], audioHash }
  )
  TranscriptionErrorReporter.reportError(error)
  throw error
}
```

### 2. Bridge Event Forwarding Fix (gemini-transcription-bridge.ts)
```typescript
// CRITICAL FIX: Use direct broadcasting instead of simulation to avoid recursion
this.middleware.broadcastStreamingTranscription({
  text: event.text,
  timestamp: event.timestamp,
  confidence: event.confidence,
  source: event.source,
  isPartial: event.isPartial,
  metadata: event.metadata
})
```

### 3. Audio Processing Protection (enhanced-audio-recording.ts)
```typescript
// 🛡️ Prevent recursive transcription calls
if (this.state.isTranscribing) {
  console.warn('🚨 EnhancedAudioRecording: Transcription already in progress - skipping to prevent recursion')
  return null
}
```

### 4. State Manager Protection (TranscriptionStateManager.ts)
```typescript
// 🛡️ Prevent listener notification recursion
if (this.isNotifyingListeners) {
  console.warn(`TranscriptionStateManager: Skipping listener notification for ${type} - already notifying to prevent recursion`)
  return
}
```

## Circuit Breaker Mechanisms

1. **Call Depth Limits**: Maximum 3 levels of transcription function calls
2. **Duplicate Call Detection**: Same audio content rejected within 1 second
3. **Event Forwarding Protection**: Duplicate events blocked in bridge
4. **Callback Timeouts**: 3-5 second timeouts on critical callbacks
5. **Emergency Stops**: Automatic shutdown on repeated errors

## Error Detection Improvements

- Stack overflow specific error detection and handling
- Enhanced logging with call stack traces
- Better error boundaries to prevent cascading failures
- Timeout protection for long-running callbacks

## Testing Strategy

The fixes should be tested with:
1. Rapid successive transcription requests
2. Large audio files that might cause processing delays
3. Network interruption scenarios
4. Multiple simultaneous WebSocket connections
5. Stress testing with continuous operation

## Monitoring

Added comprehensive logging to detect:
- Call depth violations
- Duplicate events
- Timeout conditions
- Recursion attempts
- Circuit breaker activations

Look for log messages with these prefixes:
- `🚨 STACK OVERFLOW DETECTED`
- `🛡️ Prevent recursive`
- `🚨 Bridge: CRITICAL`
- `⚠️ TranscriptionStateManager`
