# WebSocket Transcription Error Handling Guide

## Overview
This document describes the comprehensive error handling system implemented for the WebSocket transcription service to prevent stack overflow errors and provide better debugging capabilities.

## Error Types and Recovery Strategies

### Stack Overflow Errors
**Type**: `StackOverflowError`
**Cause**: Recursive function calls exceeding maximum call depth
**Recovery**: Reset transcription session and implement call depth protection
**Prevention**: 
- Call depth tracking with 3-level maximum
- Duplicate call detection with 1-second cooldown
- Emergency stop mechanisms

### Recursive Call Errors
**Type**: `RecursiveCallError`
**Cause**: Functions calling themselves without proper termination
**Recovery**: Implement duplicate call detection and cooldown period
**Prevention**:
- Audio hash-based duplicate detection
- Recent calls tracking
- Cooldown periods between identical calls

### WebSocket Connection Errors
**Type**: `WebSocketConnectionError`
**Cause**: Network issues, server unavailability, authentication failures
**Recovery**: Reconnect WebSocket with exponential backoff
**Prevention**:
- Connection state monitoring
- Heartbeat/ping mechanisms
- Graceful degradation

### Audio Processing Errors
**Type**: `AudioProcessingError`
**Cause**: Invalid audio format, processing failures, codec issues
**Recovery**: Validate audio format and retry with supported parameters
**Prevention**:
- Audio format validation
- Size and duration checks
- Format conversion fallbacks

### Circuit Breaker Errors
**Type**: `CircuitBreakerError`
**Cause**: Too many failures in a short period
**Recovery**: Wait for circuit breaker reset or manual intervention
**Prevention**:
- Failure rate monitoring
- Automatic circuit breaker reset
- Exponential backoff

## Implementation Details

### Error Reporting
All errors are reported through the `TranscriptionErrorReporter` which:
- Tracks error counts by type
- Maintains last occurrence timestamps
- Triggers alerts for critical errors
- Provides error statistics

### Error Recovery
The `TranscriptionErrorRecovery` class provides:
- Automatic retry mechanisms with exponential backoff
- Maximum retry attempt limits (3 attempts)
- Different recovery strategies per error type
- Graceful degradation paths

### Monitoring and Metrics
Error monitoring includes:
- Real-time error count tracking
- Error rate analysis
- Recovery success rates
- Performance impact assessment

## Stack Overflow Protection System

### Call Depth Tracking
```typescript
// Maximum call depth allowed
const MAX_CALL_DEPTH = 3

// Current call depth tracking
let transcriptionCallDepth = 0

// Call stack for debugging
const callStack: string[] = []
```

### Duplicate Call Detection
```typescript
// Recent calls tracking
const recentCalls = new Map<string, number>()
const CALL_COOLDOWN_MS = 1000

// Audio hash for duplicate detection
const audioHash = audioData.subarray(0, 100).toString('hex')
```

### Circuit Breaker Implementation
- Monitors failure rates
- Automatically opens circuit after threshold
- Gradually allows requests through when recovering
- Provides manual reset capabilities

## Error Context Information

Each error includes comprehensive context:
- **Timestamp**: When the error occurred
- **Call Stack**: Function call hierarchy
- **Audio Information**: Size, format, duration
- **System State**: Current depth, recent calls
- **Recovery Strategy**: Recommended next steps

## Usage Examples

### Basic Error Handling
```typescript
try {
  const result = await transcribeAudioViaWebSocket(audioData, options)
  console.log('Transcription successful:', result.text)
} catch (error) {
  if (error instanceof TranscriptionError) {
    console.error(`${error.type}: ${error.message}`)
    console.log('Recovery strategy:', error.recoveryStrategy)
    
    // Attempt automatic recovery
    const canRecover = await TranscriptionErrorRecovery.recoverFromError(error)
    if (canRecover) {
      // Retry the operation
    }
  }
}
```

### Error Statistics
```typescript
// Get current error statistics
const stats = TranscriptionErrorReporter.getErrorStats()
console.log('Error statistics:', stats)

// Example output:
// {
//   "STACK_OVERFLOW": {
//     "count": 2,
//     "lastOccurrence": "2024-01-15T10:30:00.000Z",
//     "lastMessage": "Stack overflow protection: Maximum call depth 3 exceeded"
//   },
//   "WEBSOCKET_CONNECTION": {
//     "count": 5,
//     "lastOccurrence": "2024-01-15T10:25:00.000Z",
//     "lastMessage": "WebSocket connection failed: Network error"
//   }
// }
```

## Configuration Options

### Error Thresholds
```typescript
// Maximum call depth before stack overflow protection
MAX_CALL_DEPTH = 3

// Cooldown period for duplicate call detection
CALL_COOLDOWN_MS = 1000

// Maximum recovery attempts
MAX_RECOVERY_ATTEMPTS = 3

// Circuit breaker failure threshold
CIRCUIT_BREAKER_THRESHOLD = 5
```

### Monitoring Settings
```typescript
// Error reporting intervals
ERROR_REPORT_INTERVAL = 60000 // 1 minute

// Error history retention
ERROR_HISTORY_RETENTION = 3600000 // 1 hour

// Critical error alert threshold
CRITICAL_ERROR_THRESHOLD = 5
```

## Testing and Validation

### Test Coverage
- Unit tests for each error type
- Integration tests for error recovery
- Stress tests for stack overflow protection
- Chaos testing for system resilience

### Validation Checklist
- ✅ Stack overflow protection activated correctly
- ✅ Duplicate call detection working
- ✅ Circuit breaker opens/closes as expected
- ✅ Error context contains relevant information
- ✅ Recovery strategies execute successfully
- ✅ Error statistics are accurate
- ✅ Alerts trigger for critical errors

## Troubleshooting

### Common Issues
1. **Frequent Stack Overflow Errors**
   - Check for infinite recursion in callback chains
   - Verify event listener cleanup
   - Review promise handling patterns

2. **High WebSocket Connection Errors**
   - Verify network connectivity
   - Check API key validity
   - Review rate limiting settings

3. **Audio Processing Failures**
   - Validate audio format compatibility
   - Check file size limits
   - Verify codec support

### Debug Information
Enable detailed logging by setting:
```typescript
// Enable debug mode for enhanced logging
const DEBUG_MODE = true

// Log all function entries/exits
const TRACE_CALLS = true

// Capture full stack traces
const FULL_STACK_TRACES = true
```

## Maintenance

### Regular Tasks
- Review error statistics weekly
- Update error thresholds based on usage patterns
- Clean up old error history data
- Validate recovery strategy effectiveness

### Updates and Improvements
- Monitor new error patterns
- Enhance recovery strategies
- Optimize error detection algorithms
- Update documentation with new findings

## Related Files
- `src/services/transcription-errors.ts` - Error type definitions
- `src/services/main-stt-transcription.ts` - Main transcription service
- `src/services/gemini-transcription-bridge.ts` - Event bridge service
- `src/state/TranscriptionStateManager.ts` - State management
- `STACK_OVERFLOW_FIXES.md` - Root cause analysis and fixes
