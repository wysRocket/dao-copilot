# Gemini Live API WebSocket Implementation

This directory contains the implementation of the WebSocket client for Google's Gemini Live API, enabling real-time bidirectional communication for transcription services with the `gemini-2.0-flash-live-001` model.

## ✨ Enhanced Features (v2.0)

- **Priority-Based Message Queue**: HIGH, NORMAL, LOW, CRITICAL priority levels for optimal message handling
- **Advanced Retry Mechanisms**: Exponential backoff with configurable retry limits and timeout management
- **Circuit Breaker Pattern**: Automatic failure detection and service protection
- **Enhanced Session Management**: Persistent session tracking with resumption capabilities
- **Comprehensive Statistics**: Queue metrics, circuit breaker status, and performance monitoring
- **WebSocket Lifecycle Events**: Complete event handling for connection management and reliability

## Configuration

### Enhanced Message Options

```typescript
interface MessageSendOptions {
  priority?: QueuePriority      // LOW, NORMAL, HIGH, CRITICAL
  maxRetries?: number          // Number of retry attempts (default: 3)
  timeout?: number             // Message timeout in milliseconds (default: 30000)
  expectResponse?: boolean     // Whether to expect a response (default: false)
}
```

### Updated Endpoint Configuration

```typescript
const config: GeminiLiveConfig = {
  apiKey: 'your-api-key',
  model: 'gemini-2.0-flash-live-001',  // Updated model
  responseModalities: ['TEXT', 'AUDIO'],
  websocketBaseUrl: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent', // New endpoint
  maxQueueSize: 100,                    // Message queue size limit
  reconnectAttempts: 5,
  heartbeatInterval: 30000
}
```

### Queue Statistics

```typescript
const stats = client.getQueueStatistics()
console.log('Queue Statistics:', {
  totalQueuedMessages: stats.totalQueuedMessages,
  messagesByPriority: stats.messagesByPriority,
  circuitBreakerState: stats.circuitBreakerState,
  errorStatistics: stats.errorStatistics
})
```

## Files Overview

### Core Implementation

- **`gemini-live-websocket.ts`** - Main WebSocket client implementation
- **`gemini-audio-utils.ts`** - Audio format conversion utilities
- **`gemini-message-handler.ts`** - Advanced message processing and queuing
- **`gemini-error-handler.ts`** - Error classification and retry logic
- **`gemini-logger.ts`** - Structured logging with multiple outputs
- **`gemini-reconnection-manager.ts`** - Advanced reconnection strategies and metrics
- **`gemini-live-integration.ts`** - Integration service coordinating WebSocket and batch processing
- **`gemini-live-integration-factory.ts`** - Factory and utilities for integration service

### Testing and Examples

- **`gemini-live-websocket-test.ts`** - WebSocket client integration test
- **`gemini-reconnection-manager-test.ts`** - ReconnectionManager test suite
- **`gemini-live-integration-test.ts`** - Integration service test suite
- **`gemini-error-handler-test.ts`** - Error handling and logging test suite

## UI Components

### Core UI Components

- **`../components/WebSocketConnectionStatus.tsx`** - Comprehensive connection status display
- **`../components/GeminiConnectionIndicator.tsx`** - Compact connection indicator
- **`../components/GeminiLiveExample.tsx`** - Complete integration example
- **`../hooks/useGeminiConnection.ts`** - React hook for connection management

### Enhanced Components

- **`../components/ui/window-status.tsx`** - Updated with Gemini connection support

## Features

### WebSocket Connection Management

- ✅ Secure WebSocket (wss://) connections
- ✅ Connection state tracking and management
- ✅ Advanced reconnection with multiple strategies (exponential, linear, fibonacci, custom)
- ✅ Connection quality monitoring and metrics
- ✅ Intelligent backoff with jitter support
- ✅ Heartbeat monitoring to maintain connection health
- ✅ Graceful connection establishment and teardown
- ✅ Connection timeout handling
- ✅ Unstable connection detection and handling

### Advanced Reconnection System

- ✅ Multiple backoff strategies (exponential, linear, fibonacci, custom)
- ✅ Connection quality assessment (excellent, good, poor, unstable)
- ✅ Jitter support to prevent thundering herd
- ✅ Connection metrics and history tracking
- ✅ Configurable thresholds and limits
- ✅ Real-time reconnection countdown
- ✅ State recovery after reconnection

### Message Handling

- ✅ Priority-based message queuing system
- ✅ Message type detection and validation
- ✅ JSON message serialization/deserialization
- ✅ Message queuing when connection is not ready
- ✅ Support for text and audio input
- ✅ Real-time message processing
- ✅ Event-driven architecture with EventEmitter

### Error Handling and Logging

- ✅ Structured error classification and handling
- ✅ Error statistics and retry logic
- ✅ Multi-level logging (DEBUG, INFO, WARN, ERROR, FATAL)
- ✅ Multiple log outputs (console, memory, file)
- ✅ Error history tracking and export
- ✅ Performance monitoring and metrics

### Integration Service

- ✅ Seamless coordination between WebSocket and batch transcription
- ✅ Multiple operating modes (WebSocket, Batch, Hybrid)
- ✅ Automatic failover and fallback capabilities
- ✅ Real-time audio streaming to WebSocket
- ✅ Configuration presets for different use cases
- ✅ State management and monitoring
- ✅ Factory pattern for easy service creation

### Audio Processing

- ✅ Audio format conversion (Float32 to 16-bit PCM)
- ✅ Sample rate conversion (to 16kHz requirement)
- ✅ Stereo to mono conversion
- ✅ Base64 encoding for WebSocket transmission
- ✅ Audio format validation

### Error Handling

- ✅ Comprehensive error handling and logging
- ✅ Network error recovery
- ✅ Connection timeout management
- ✅ Maximum reconnection attempt limits
- ✅ Event emission for error states

## Usage Examples

### Basic WebSocket Client

```typescript
import GeminiLiveWebSocketClient from './gemini-live-websocket'

const client = new GeminiLiveWebSocketClient({
  apiKey: 'your-api-key',
  model: 'gemini-2.0-flash-live-001',
  responseModalities: ['AUDIO'],
  systemInstruction: 'You are a helpful assistant.',
  reconnectAttempts: 5,
  heartbeatInterval: 30000,
  reconnectionStrategy: 'exponential', // or 'linear', 'fibonacci', 'custom'
  reconnectionConfig: {
    baseDelay: 1000,
    maxDelay: 30000,
    jitterEnabled: true,
    jitterRange: 0.1,
    qualityThreshold: 0.8
  }
})

// Set up event listeners
client.on('connected', () => {
  console.log('Connected to Gemini Live API')
})

client.on('message', message => {
  console.log('Received:', message)
})

client.on('audioData', audioData => {
  console.log('Received audio data')
})

// Advanced reconnection events
client.on('reconnectionStarted', data => {
  console.log(`Reconnection started: attempt ${data.attempt}`)
})

client.on('connectionQualityUpdate', quality => {
  console.log(`Connection quality: ${quality}`)
})

client.on('reconnectionCountdown', data => {
  console.log(`Next attempt in ${data.remaining}ms`)
})

// Connect and send messages
await client.connect()

client.sendRealtimeInput({
  text: 'Hello, how are you?'
})

client.sendRealtimeInput({
  audio: {
    data: base64AudioData,
    mimeType: 'audio/pcm;rate=16000'
  }
})

// Access advanced metrics
const metrics = client.getConnectionMetrics()
console.log('Connection quality:', metrics.connectionQuality)
console.log('Successful connections:', metrics.successfulConnections)

const reconnectionState = client.getReconnectionState()
console.log('Is reconnecting:', reconnectionState.isReconnecting)
console.log('Attempt count:', reconnectionState.attemptCount)
```

### Integration Service (Recommended)

The integration service provides a higher-level API that coordinates between WebSocket and batch transcription:

```typescript
import {GeminiLiveIntegrationFactory, TranscriptionMode} from './gemini-live-integration-factory'

// Create with preset configurations
const integrationService = GeminiLiveIntegrationFactory.createProduction('your-api-key', {
  mode: TranscriptionMode.HYBRID, // or WEBSOCKET, BATCH
  fallbackToBatch: true
})

// Or create from environment variables
const envService = GeminiLiveIntegrationFactory.createFromEnvironment('production')

// Set up event listeners
integrationService.on('transcription', (result, source) => {
  console.log(`Transcription from ${source}:`, result.text)
})

integrationService.on('modeChanged', mode => {
  console.log(`Switched to ${mode} mode`)
})

integrationService.on('failover', mode => {
  console.log(`Failed over to ${mode} mode`)
})

// Start transcription
await integrationService.startTranscription()

// Switch modes dynamically
await integrationService.switchMode(TranscriptionMode.WEBSOCKET)

// Get comprehensive metrics
const metrics = integrationService.getMetrics()
const state = integrationService.getState()

console.log('Service state:', state)
console.log('Performance metrics:', metrics)
```

### Factory Presets

Use predefined configurations for common scenarios:

```typescript
import {GeminiLiveIntegrationFactory} from './gemini-live-integration-factory'

// Development (fast reconnection, verbose logging)
const devService = GeminiLiveIntegrationFactory.createDevelopment('api-key')

// Production (robust, optimized for reliability)
const prodService = GeminiLiveIntegrationFactory.createProduction('api-key')

// Real-time (low latency, WebSocket-only)
const realtimeService = GeminiLiveIntegrationFactory.createRealtime('api-key')

// Batch-only (traditional processing)
const batchService = GeminiLiveIntegrationFactory.createBatchOnly('api-key')
```

### Monitoring and Health Checks

```typescript
import {IntegrationUtils} from './gemini-live-integration-factory'

// Monitor service state
const stopMonitoring = IntegrationUtils.monitorState(integrationService, 5000)

// Get health status
const health = IntegrationUtils.getHealthStatus(integrationService)
console.log('Health:', health.status, health.details)

// Generate performance report
const report = IntegrationUtils.createPerformanceReport(integrationService)
console.log(report)

// Stop monitoring
stopMonitoring()
```

## Connection States

The client manages the following connection states:

- **DISCONNECTED** - No active connection
- **CONNECTING** - Attempting to establish connection
- **CONNECTED** - Successfully connected and ready
- **RECONNECTING** - Attempting to reconnect after failure
- **ERROR** - Connection error occurred

## Events

The WebSocket client emits the following events:

- **`connected`** - Connection successfully established
- **`disconnected`** - Connection closed
- **`stateChange`** - Connection state changed
- **`message`** - Raw message received from API
- **`serverContent`** - Server content message
- **`modelTurn`** - Model turn in conversation
- **`turnComplete`** - Turn completed
- **`audioData`** - Audio data received
- **`messageSent`** - Message sent successfully
- **`error`** - Error occurred
- **`maxReconnectAttemptsReached`** - Maximum reconnection attempts reached
- **`reconnectionStarted`** - Reconnection process started
- **`reconnectionAttempt`** - Reconnection attempt in progress
- **`reconnectionFailed`** - Reconnection attempt failed
- **`reconnectionStopped`** - Reconnection process stopped
- **`reconnectionCountdown`** - Countdown to next reconnection attempt
- **`connectionQualityUpdate`** - Connection quality changed
- **`closed`** - Connection closed gracefully

## Audio Requirements

The Gemini Live API requires audio in a specific format:

- **Format**: 16-bit PCM
- **Sample Rate**: 16,000 Hz (16kHz)
- **Channels**: 1 (mono)
- **Encoding**: Base64 for WebSocket transmission

The audio utilities automatically handle format conversion from common audio formats.

## Testing

Run the integration test to verify the implementation:

```bash
npx ts-node src/services/gemini-live-websocket-test.ts
```

Run the ReconnectionManager test suite:

```bash
npx ts-node src/services/gemini-reconnection-manager-test.ts
```

Make sure to set your API key in the environment:

```bash
export GOOGLE_API_KEY="your-api-key"
# or
export GEMINI_API_KEY="your-api-key"
```

## Next Steps

1. **Integration with Existing Services** (Task 13.6) - Connect with audio services
2. **UI Components** (Task 13.7) - Build user interface components
3. **Comprehensive Testing** (Task 13.8) - Add unit and integration tests
4. **Performance Optimization** (Task 13.9) - Optimize for production use
5. **Documentation** (Task 13.10) - Complete API documentation

## Configuration Options

```typescript
interface GeminiLiveConfig {
  apiKey: string // Required: API key for authentication
  model?: string // Default: 'gemini-2.0-flash-live-001'
  responseModalities?: string[] // Default: ['AUDIO']
  systemInstruction?: string // Default: friendly assistant instruction
  reconnectAttempts?: number // Default: 5
  heartbeatInterval?: number // Default: 30000ms (30 seconds)
  connectionTimeout?: number // Default: 10000ms (10 seconds)
  reconnectionStrategy?: ReconnectionStrategy // Default: 'exponential'
  reconnectionConfig?: Partial<ReconnectionConfig> // Advanced reconnection settings
}

interface ReconnectionConfig {
  maxAttempts: number // Maximum reconnection attempts
  strategy: ReconnectionStrategy // Backoff strategy
  baseDelay: number // Base delay in milliseconds
  maxDelay: number // Maximum delay in milliseconds
  jitterEnabled: boolean // Enable jitter to prevent thundering herd
  jitterRange: number // Jitter range (0.0 - 1.0)
  qualityThreshold: number // Connection quality threshold
  unstableConnectionThreshold: number // Threshold for unstable connections
  backoffMultiplier: number // Multiplier for exponential backoff
  customDelayFunction?: (attempt: number) => number // Custom delay function
}
```

## Error Handling

The implementation includes comprehensive error handling for:

- Network connectivity issues
- API authentication failures
- Message parsing errors
- Connection timeouts
- WebSocket protocol errors
- Audio format validation errors

All errors are logged and emitted as events for proper handling by the application.

## UI Components Documentation

### WebSocketConnectionStatus Component

A comprehensive component for displaying WebSocket connection status and quality metrics:

```tsx
import React from 'react'
import {WebSocketConnectionStatus} from '../components/WebSocketConnectionStatus'
import {useGeminiConnection} from '../hooks/useGeminiConnection'

function MyComponent() {
  const {client} = useGeminiConnection()

  return (
    <WebSocketConnectionStatus
      client={client}
      showQuality={true}
      showMetrics={true}
      showControls={true}
      compact={false}
    />
  )
}
```

Props:

- `client`: GeminiLiveWebSocketClient instance
- `showQuality`: Display connection quality indicator
- `showMetrics`: Show detailed connection metrics
- `showControls`: Include connect/disconnect buttons
- `compact`: Use compact display mode

### GeminiConnectionIndicator Component

A lightweight connection status indicator:

```tsx
import React from 'react'
import {GeminiConnectionIndicator} from '../components/GeminiConnectionIndicator'

function StatusBar() {
  return (
    <div className="status-bar">
      <GeminiConnectionIndicator showQuality={true} showReconnection={true} className="mr-2" />
    </div>
  )
}
```

Props:

- `showQuality`: Display connection quality
- `showReconnection`: Show reconnection status
- `className`: Additional CSS classes

### useGeminiConnection Hook

React hook for managing Gemini WebSocket connections:

```tsx
import React, {useEffect} from 'react'
import {useGeminiConnection} from '../hooks/useGeminiConnection'

function TranscriptionComponent() {
  const {
    client,
    integrationService,
    connectionState,
    isConnected,
    quality,
    metrics,
    connect,
    disconnect,
    sendMessage,
    switchMode
  } = useGeminiConnection({
    apiKey: 'your-api-key',
    mode: 'hybrid'
  })

  useEffect(() => {
    // Listen for transcription results
    integrationService?.on('transcription', (result, source) => {
      console.log(`Transcription from ${source}:`, result.text)
    })
  }, [integrationService])

  return (
    <div>
      <div>Status: {connectionState}</div>
      <div>Quality: {quality}</div>
      <button onClick={connect} disabled={isConnected}>
        Connect
      </button>
      <button onClick={disconnect} disabled={!isConnected}>
        Disconnect
      </button>
      <button onClick={() => sendMessage('Hello!')}>Send Message</button>
    </div>
  )
}
```

### Enhanced WindowStatus Component

The existing WindowStatus component has been enhanced with Gemini connection support:

```tsx
import React from 'react'
import {WindowStatus} from '../components/ui/window-status'

function AppStatusBar() {
  return (
    <WindowStatus
      showWindowInfo={true}
      showConnectionStatus={true}
      showRecordingStatus={true}
      showGeminiConnection={true}
      showTranscriptCount={true}
      compact={false}
    />
  )
}
```

New props:

- `showGeminiConnection`: Display Gemini WebSocket connection status

### Complete Integration Example

Here's a complete example showing how to integrate all components:

```tsx
import React, {useEffect, useState} from 'react'
import {
  GeminiLiveIntegrationFactory,
  TranscriptionMode
} from '../services/gemini-live-integration-factory'
import {WebSocketConnectionStatus} from '../components/WebSocketConnectionStatus'
import {useGeminiConnection} from '../hooks/useGeminiConnection'
import {TranscriptionResult} from '../services/audio-recording'

function GeminiLiveExample() {
  const {
    client,
    integrationService,
    connectionState,
    isConnected,
    quality,
    connect,
    disconnect,
    switchMode
  } = useGeminiConnection({
    apiKey: process.env.REACT_APP_GEMINI_API_KEY!,
    mode: TranscriptionMode.HYBRID
  })

  const [transcripts, setTranscripts] = useState<TranscriptionResult[]>([])
  const [currentMode, setCurrentMode] = useState<TranscriptionMode>(TranscriptionMode.HYBRID)

  useEffect(() => {
    if (!integrationService) return

    const handleTranscription = (result: TranscriptionResult, source: string) => {
      setTranscripts(prev => [...prev, {...result, source}])
    }

    const handleModeChange = (mode: TranscriptionMode) => {
      setCurrentMode(mode)
    }

    integrationService.on('transcription', handleTranscription)
    integrationService.on('modeChanged', handleModeChange)

    return () => {
      integrationService.off('transcription', handleTranscription)
      integrationService.off('modeChanged', handleModeChange)
    }
  }, [integrationService])

  const handleModeSwitch = async (mode: TranscriptionMode) => {
    await switchMode(mode)
    setCurrentMode(mode)
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Gemini Live Transcription</h2>
        <div className="flex items-center space-x-2">
          <select
            value={currentMode}
            onChange={e => handleModeSwitch(e.target.value as TranscriptionMode)}
            className="rounded border px-2 py-1"
          >
            <option value={TranscriptionMode.HYBRID}>Hybrid</option>
            <option value={TranscriptionMode.WEBSOCKET}>WebSocket</option>
            <option value={TranscriptionMode.BATCH}>Batch</option>
          </select>
          <button
            onClick={isConnected ? disconnect : connect}
            className={`rounded px-3 py-1 ${
              isConnected ? 'bg-red-500 text-white' : 'bg-green-500 text-white'
            }`}
          >
            {isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      <WebSocketConnectionStatus
        client={client}
        showQuality={true}
        showMetrics={true}
        showControls={false}
        compact={false}
      />

      <div className="rounded bg-gray-100 p-4">
        <h3 className="mb-2 font-semibold">Transcription Results</h3>
        <div className="max-h-60 space-y-2 overflow-y-auto">
          {transcripts.map((transcript, index) => (
            <div key={index} className="rounded border bg-white p-2">
              <div className="text-sm text-gray-500">
                {new Date(transcript.timestamp).toLocaleTimeString()}
                {transcript.source && ` (${transcript.source})`}
              </div>
              <div>{transcript.text}</div>
              {transcript.confidence && (
                <div className="text-xs text-gray-400">
                  Confidence: {Math.round(transcript.confidence * 100)}%
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default GeminiLiveExample
```

## Integration with Existing Services

### Audio Recording Service Integration

The integration service automatically coordinates with the existing audio recording service:

```typescript
import {getAudioRecordingService} from './audio-recording'
import {GeminiLiveIntegrationFactory} from './gemini-live-integration'

// The integration service automatically connects to the audio recording service
const integrationService = GeminiLiveIntegrationFactory.createFromEnvironment()

// Audio recording state is automatically synchronized
integrationService.on('recordingStateChanged', state => {
  console.log('Recording state:', state)
})

// Start transcription (automatically starts recording if needed)
await integrationService.startTranscription()
```

### Transcription Service Migration

The existing transcription services have been enhanced to support WebSocket mode:

```typescript
// main-stt-transcription.ts now supports WebSocket mode
import {TranscriptionMode} from './gemini-live-integration'

// Existing batch processing remains unchanged
const batchResult = await transcribeAudio(audioData, {
  mode: TranscriptionMode.BATCH
})

// New WebSocket real-time processing
const realtimeResult = await transcribeAudio(audioData, {
  mode: TranscriptionMode.WEBSOCKET,
  realTime: true
})

// Hybrid mode automatically chooses the best option
const hybridResult = await transcribeAudio(audioData, {
  mode: TranscriptionMode.HYBRID
})
```

## Performance Considerations

### Optimizations Implemented

1. **Connection Pooling**: Reuse WebSocket connections when possible
2. **Message Queuing**: Queue messages when connection is not ready
3. **Automatic Fallback**: Fallback to batch processing when WebSocket fails
4. **Quality Monitoring**: Automatically adjust based on connection quality
5. **Efficient Audio Processing**: Optimized audio format conversion
6. **Memory Management**: Proper cleanup of resources and event listeners

### Best Practices

1. **Use Integration Service**: Always prefer the integration service over direct WebSocket client
2. **Monitor Connection Quality**: React to connection quality changes
3. **Implement Proper Error Handling**: Handle all error scenarios gracefully
4. **Use Appropriate Modes**: Choose the right mode for your use case
5. **Cleanup Resources**: Always cleanup event listeners and connections

## Troubleshooting

### Common Issues

1. **Connection Failures**

   - Check API key validity
   - Verify network connectivity
   - Check firewall settings for WebSocket connections

2. **Audio Processing Issues**

   - Ensure audio format meets requirements (16-bit PCM, 16kHz, mono)
   - Check audio device permissions
   - Verify audio input source

3. **Performance Issues**
   - Monitor connection quality metrics
   - Consider switching to batch mode for poor connections
   - Check system resources (CPU, memory)

### Debug Logging

Enable debug logging for troubleshooting:

```typescript
import {logger} from './gemini-logger'

// Set log level to DEBUG
logger.setLevel('DEBUG')

// Enable console output
logger.addOutput('console')

// Enable file output for persistent logging
logger.addOutput('file', {
  filename: './logs/gemini-debug.log',
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
})
```

## Environment Variables

Configure the integration using environment variables:

```bash
# Required
GOOGLE_API_KEY=your-google-api-key
# or
GEMINI_API_KEY=your-gemini-api-key

# Optional
GEMINI_MODEL=gemini-2.0-flash-live-001
GEMINI_RECONNECT_ATTEMPTS=5
GEMINI_HEARTBEAT_INTERVAL=30000
GEMINI_CONNECTION_TIMEOUT=10000
GEMINI_RECONNECTION_STRATEGY=exponential
GEMINI_BASE_DELAY=1000
GEMINI_MAX_DELAY=30000
GEMINI_ENABLE_JITTER=true
GEMINI_JITTER_RANGE=0.1
GEMINI_QUALITY_THRESHOLD=0.8
GEMINI_UNSTABLE_THRESHOLD=3
GEMINI_BACKOFF_MULTIPLIER=2.0
```

## API Reference

### GeminiLiveWebSocketClient

Main WebSocket client class.

#### Constructor

```typescript
new GeminiLiveWebSocketClient(config: GeminiLiveConfig)
```

#### Methods

- `connect(): Promise<void>` - Establish WebSocket connection
- `disconnect(): void` - Close WebSocket connection
- `sendRealtimeInput(input: RealtimeInput): void` - Send input to API
- `isConnected(): boolean` - Check connection status
- `getConnectionMetrics(): ConnectionMetrics` - Get connection metrics
- `getReconnectionState(): ReconnectionState` - Get reconnection state
- `updateReconnectionConfig(config: Partial<ReconnectionConfig>): void` - Update reconnection configuration

#### Events

- `connected` - Connection established
- `disconnected` - Connection closed
- `message` - Message received
- `error` - Error occurred
- `reconnectionStarted` - Reconnection process started
- `connectionQualityUpdate` - Connection quality changed

### GeminiLiveIntegrationService

High-level integration service.

#### Constructor

```typescript
new GeminiLiveIntegrationService(config: Partial<IntegrationConfig>)
```

#### Methods

- `startTranscription(): Promise<void>` - Start transcription service
- `stopTranscription(): Promise<void>` - Stop transcription service
- `switchMode(mode: TranscriptionMode): Promise<void>` - Switch operating mode
- `getState(): IntegrationState` - Get current state
- `getMetrics(): IntegrationMetrics` - Get performance metrics
- `destroy(): Promise<void>` - Cleanup and destroy service

#### Events

- `transcription` - Transcription result received
- `modeChanged` - Operating mode changed
- `failover` - Automatic failover occurred
- `error` - Error occurred
