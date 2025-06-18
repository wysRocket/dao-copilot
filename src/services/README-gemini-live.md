# Gemini Live API WebSocket Implementation

This directory contains the implementation of the WebSocket client for Google's Gemini Live API, enabling real-time bidirectional communication for transcription services.

## Files Overview

### Core Implementation
- **`gemini-live-websocket.ts`** - Main WebSocket client implementation
- **`gemini-audio-utils.ts`** - Audio format conversion utilities
- **`gemini-live-websocket-test.ts`** - Integration test and usage examples

## Features

### WebSocket Connection Management
- ✅ Secure WebSocket (wss://) connections
- ✅ Connection state tracking and management
- ✅ Automatic reconnection with exponential backoff
- ✅ Heartbeat monitoring to maintain connection health
- ✅ Graceful connection establishment and teardown
- ✅ Connection timeout handling

### Message Handling
- ✅ JSON message serialization/deserialization
- ✅ Message queuing when connection is not ready
- ✅ Support for text and audio input
- ✅ Real-time message processing
- ✅ Event-driven architecture with EventEmitter

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
  heartbeatInterval: 30000
})

// Set up event listeners
client.on('connected', () => {
  console.log('Connected to Gemini Live API')
})

client.on('message', (message) => {
  console.log('Received:', message)
})

client.on('audioData', (audioData) => {
  console.log('Received audio data')
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

Make sure to set your API key in the environment:

```bash
export GOOGLE_API_KEY="your-api-key"
# or
export GEMINI_API_KEY="your-api-key"
```

## Next Steps

1. **Message Handling System** (Task 13.2) - Implement advanced message processing
2. **Authentication Mechanism** (Task 13.3) - Add secure authentication
3. **Error Handling System** (Task 13.4) - Enhance error handling and logging
4. **Reconnection Logic** (Task 13.5) - Improve reconnection strategies
5. **Integration with Existing Services** (Task 13.6) - Connect with audio services

## Configuration Options

```typescript
interface GeminiLiveConfig {
  apiKey: string                    // Required: API key for authentication
  model?: string                    // Default: 'gemini-2.0-flash-live-001'
  responseModalities?: string[]     // Default: ['AUDIO']
  systemInstruction?: string        // Default: friendly assistant instruction
  reconnectAttempts?: number        // Default: 5
  heartbeatInterval?: number        // Default: 30000ms (30 seconds)
  connectionTimeout?: number        // Default: 10000ms (10 seconds)
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
