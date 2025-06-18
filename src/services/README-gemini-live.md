# Gemini Live API WebSocket Implementation

This directory contains the implementation of the WebSocket client for Google's Gemini Live API, enabling real-time bidirectional communication for transcription services.

## Files Overview

### Core Implementation

- **`gemini-live-websocket.ts`** - Main WebSocket client implementation
- **`gemini-audio-utils.ts`** - Audio format conversion utilities
- **`gemini-message-handler.ts`** - Advanced message processing and queuing
- **`gemini-error-handler.ts`** - Error classification and retry logic
- **`gemini-logger.ts`** - Structured logging with multiple outputs
- **`gemini-reconnection-manager.ts`** - Advanced reconnection strategies and metrics
- **`gemini-live-websocket-test.ts`** - Integration test and usage examples
- **`gemini-reconnection-manager-test.ts`** - ReconnectionManager test suite

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

## Usage Example

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
