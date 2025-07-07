# WebSocket Integration Documentation

## Overview

This document describes the comprehensive WebSocket integration implemented for the Gemini Live API in the DAO Copilot application. The integration provides real-time transcription capabilities while maintaining full backward compatibility with existing batch processing methods.

## Architecture

The WebSocket integration is built around a hierarchical service architecture:

### 1. TranscriptionPipeline (Primary)

- **File**: `src/services/transcription-pipeline.ts`
- **Purpose**: Central orchestrator for complete transcription workflow
- **Features**:
  - Event-driven architecture with 15 PipelineEvent types
  - Support for multiple transcription modes (WEBSOCKET, BATCH, HYBRID)
  - Comprehensive error handling with exponential backoff retry
  - Performance monitoring (latency, throughput, buffer health)
  - Configuration management with real-time updates
  - State management with React context integration

### 2. Enhanced React Context (UI Integration)

- **File**: `src/contexts/TranscriptionPipelineContext.tsx`
- **Purpose**: React state management for transcription pipeline
- **Features**:
  - TranscriptionPipelineProvider with auto-initialization
  - Multiple specialized hooks for different aspects
  - Performance optimizations with debouncing and optimized re-renders
  - Error handling with proper error propagation
  - Memory management with transcript history limiting

### 3. Enhanced Audio Recording Service (Audio Processing)

- **File**: `src/services/audio-recording.ts` (updated)
- **Purpose**: Audio capture with real-time streaming support
- **Features**:
  - Support for both interval-based and real-time streaming modes
  - RecordingMode enum (INTERVAL, STREAMING, HYBRID)
  - Buffer management with health monitoring
  - StreamingCallbacks for external integration

### 4. Enhanced UI Components (User Interface)

- **File**: `src/components/EnhancedTranscriptDisplay.tsx`
- **Purpose**: Real-time transcription display with performance optimizations
- **Features**:
  - Real-time WebSocket transcription display
  - Performance optimizations (debouncing, virtualization)
  - Mode toggle functionality and connection status indicators
  - Smart scrolling with user interaction detection

### 5. Integration Services (Service Layer)

- **Files**:
  - `src/services/main-stt-transcription.ts` (updated)
  - `src/services/proxy-stt-transcription.ts` (updated)
- **Purpose**: Integration with existing transcription services
- **Features**:
  - Unified service hierarchy with graceful degradation
  - TranscriptionPipeline integration while maintaining backward compatibility
  - Environment-based feature toggling

## Configuration

### Environment Variables

```env
# Pipeline Features
GEMINI_PIPELINE_ENABLED=true           # Enable TranscriptionPipeline (default: true)
GEMINI_WEBSOCKET_ENABLED=true          # Enable WebSocket functionality (default: true)
GEMINI_FALLBACK_TO_BATCH=true          # Enable fallback to batch mode (default: true)

# Model Configuration
GEMINI_MODEL=gemini-live-2.5-flash-preview  # Live API compatible model

# API Configuration
GOOGLE_API_KEY=your_api_key             # Primary API key
VITE_GOOGLE_API_KEY=your_api_key        # Frontend API key
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key    # Alternative key name
GEMINI_API_KEY=your_api_key             # Alternative key name

# Performance Tuning
GEMINI_REALTIME_THRESHOLD=3000          # Threshold for real-time processing (ms)
GEMINI_TRANSCRIPTION_MODE=hybrid        # Default mode: websocket, batch, or hybrid

# Proxy Configuration (if using proxy)
PROXY_URL=http://localhost:8001         # Proxy server URL
```

### Programmatic Configuration

```typescript
// Basic TranscriptionPipeline configuration
const config: TranscriptionPipelineConfig = {
  mode: TranscriptionMode.HYBRID,
  fallbackToBatch: true,
  realTimeThreshold: 1000,
  model: 'gemini-live-2.5-flash-preview',
  retryConfig: {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelayMs: 1000
  },
  performanceConfig: {
    enableMonitoring: true,
    bufferSizeThreshold: 0.8,
    latencyThreshold: 2000
  }
}

// Create pipeline instance
const pipeline = createProductionTranscriptionPipeline(apiKey, config)
```

## Usage Examples

### 1. React Component Integration

```tsx
import {
  TranscriptionPipelineProvider,
  useTranscriptionPipeline
} from '@/contexts/TranscriptionPipelineContext'

function TranscriptionApp() {
  return (
    <TranscriptionPipelineProvider autoInitialize={true} apiKey={process.env.GOOGLE_API_KEY}>
      <TranscriptionInterface />
    </TranscriptionPipelineProvider>
  )
}

function TranscriptionInterface() {
  const {startTranscription, stopTranscription, transcripts, isInitialized, error} =
    useTranscriptionPipeline()

  const handleStart = async () => {
    try {
      await startTranscription()
    } catch (err) {
      console.error('Failed to start transcription:', err)
    }
  }

  return (
    <div>
      <button onClick={handleStart} disabled={!isInitialized}>
        Start Recording
      </button>
      <TranscriptList transcripts={transcripts} />
      {error && <ErrorDisplay error={error} />}
    </div>
  )
}
```

### 2. Direct Service Usage

```typescript
import {
  createProductionTranscriptionPipeline,
  TranscriptionMode
} from '@/services/transcription-pipeline'

// Initialize pipeline
const pipeline = createProductionTranscriptionPipeline(apiKey, {
  mode: TranscriptionMode.WEBSOCKET,
  fallbackToBatch: true
})

// Set up event listeners
pipeline.on('transcription', result => {
  console.log('Transcription received:', result.text)
})

pipeline.on('error', error => {
  console.error('Pipeline error:', error)
})

// Initialize and start
await pipeline.initialize()
await pipeline.startTranscription()
```

### 3. Audio Recording Integration

```typescript
import {AudioRecordingService, RecordingMode} from '@/services/audio-recording'

const audioService = new AudioRecordingService()

// Set up for streaming mode
audioService.setMode(RecordingMode.STREAMING)
audioService.setStreamingCallbacks({
  onAudioChunk: chunk => {
    // Send to TranscriptionPipeline
    pipeline.processAudioChunk(chunk)
  },
  onError: error => {
    console.error('Audio error:', error)
  }
})

// Start streaming
audioService.startStreaming()
```

## Performance Optimizations

### 1. Debouncing and Throttling

- UI updates are debounced by 150ms by default
- Audio chunks are processed in real-time with efficient buffering
- State updates are optimized to prevent excessive re-renders

### 2. Memory Management

- Transcript history is limited to 1000 entries (trimmed to 500 when exceeded)
- Audio buffers are managed with configurable size limits
- Proper cleanup of event listeners and resources

### 3. Connection Management

- Automatic reconnection with exponential backoff
- Connection health monitoring with quality metrics
- Graceful degradation when WebSocket connections fail

### 4. Smart Mode Selection

- Automatic mode selection based on audio length and characteristics
- Real-time threshold configuration for optimal performance
- Fallback mechanisms for different network conditions

## Error Handling

### 1. Pipeline-Level Error Handling

```typescript
pipeline.on('error', error => {
  switch (error.type) {
    case 'CONNECTION_ERROR':
      // Handle WebSocket connection issues
      break
    case 'TRANSCRIPTION_ERROR':
      // Handle transcription processing errors
      break
    case 'TIMEOUT_ERROR':
      // Handle timeout scenarios
      break
    default:
    // Handle unknown errors
  }
})
```

### 2. Service-Level Error Handling

- Graceful degradation between service layers
- Automatic fallback from WebSocket to batch processing
- Comprehensive error logging for debugging

### 3. UI-Level Error Handling

- Error boundaries for React components
- User-friendly error messages
- Recovery suggestions and retry mechanisms

## Testing

### 1. Unit Tests

```bash
# Run transcription pipeline tests
npm test -- transcription-pipeline

# Run audio recording tests
npm test -- audio-recording

# Run context tests
npm test -- TranscriptionPipelineContext
```

### 2. Integration Tests

```bash
# End-to-end transcription workflow
npm test -- e2e-transcription

# WebSocket connectivity tests
npm test -- websocket-integration
```

### 3. Performance Tests

```bash
# Performance monitoring tests
npm test -- performance

# Memory leak detection
npm test -- memory-tests
```

## Monitoring and Debugging

### 1. Performance Metrics

- Latency tracking for real-time responsiveness
- Throughput monitoring for processing capacity
- Buffer health for audio processing efficiency
- Connection quality for WebSocket stability

### 2. Debug Logging

```typescript
// Enable debug logging
localStorage.setItem('DEBUG', 'transcription:*')

// View pipeline state
console.log(pipeline.getState())

// Monitor performance metrics
console.log(pipeline.getPerformanceMetrics())
```

### 3. React DevTools Integration

- TranscriptionPipelineContext state inspection
- Performance profiling for component re-renders
- Event listener monitoring

## Migration Guide

### From Existing Batch Transcription

1. No code changes required - backward compatibility maintained
2. Enable WebSocket features through environment variables
3. Gradually migrate to TranscriptionPipeline for enhanced features

### From Legacy WebSocket Implementation

1. Replace direct WebSocket usage with TranscriptionPipeline
2. Update React components to use TranscriptionPipelineContext
3. Migrate configuration to new format

### Integration Checklist

- [ ] Environment variables configured
- [ ] API keys properly set
- [ ] TranscriptionPipelineProvider added to app root
- [ ] Components updated to use new hooks
- [ ] Error handling implemented
- [ ] Performance monitoring enabled
- [ ] Testing completed

## API Reference

### Core Classes

#### TranscriptionPipeline

```typescript
class TranscriptionPipeline extends EventEmitter {
  initialize(): Promise<void>
  startTranscription(): Promise<void>
  stopTranscription(): Promise<void>
  switchMode(mode: TranscriptionMode): Promise<void>
  getState(): PipelineState
  getConfig(): TranscriptionPipelineConfig
  updateConfig(updates: Partial<TranscriptionPipelineConfig>): void
  destroy(): Promise<void>
}
```

#### AudioRecordingService

```typescript
class AudioRecordingService {
  setMode(mode: RecordingMode): void
  startStreaming(callbacks?: StreamingCallbacks): void
  stopStreaming(): void
  startIntervalRecording(callback?: Function): void
  stopIntervalRecording(): void
  getState(): RecordingState
}
```

### React Hooks

#### useTranscriptionPipeline

```typescript
const {
  pipeline,
  pipelineState,
  transcripts,
  isInitialized,
  error,
  startTranscription,
  stopTranscription,
  switchMode
} = useTranscriptionPipeline()
```

#### Specialized Hooks

```typescript
const {isConnected, connectionQuality} = useConnectionState()
const {isRecording, currentMode} = useRecordingState()
const {latency, throughput} = usePerformanceMetrics()
const debouncedTranscripts = useTranscripts(150) // 150ms debounce
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Fails**
   - Check API key validity
   - Verify network connectivity
   - Ensure correct model name
   - Check CORS settings

2. **Audio Recording Issues**
   - Verify microphone permissions
   - Check audio device availability
   - Ensure proper sample rate configuration

3. **Performance Issues**
   - Reduce debounce timeout
   - Limit transcript history
   - Monitor memory usage
   - Check connection quality

### Debug Commands

```javascript
// In browser console
window.transcriptionDebug = {
  pipeline: pipeline,
  state: pipeline.getState(),
  config: pipeline.getConfig(),
  metrics: pipeline.getPerformanceMetrics()
}
```

## Future Enhancements

### Planned Features

1. Multi-language support
2. Custom vocabulary integration
3. Speaker diarization
4. Real-time translation
5. Audio processing filters
6. Cloud storage integration

### Performance Improvements

1. WebAssembly audio processing
2. Service worker for background processing
3. IndexedDB for local transcript storage
4. Compression for audio streaming

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review error logs and console output
3. Test with minimal configuration
4. Verify environment variable setup
5. Check network connectivity and API key validity

## Version History

- **v1.0.0**: Initial WebSocket integration
- **v1.1.0**: TranscriptionPipeline implementation
- **v1.2.0**: React context integration
- **v1.3.0**: Enhanced audio recording support
- **v1.4.0**: Comprehensive service integration (current)
