# GCP Services - SDK Implementation

This directory contains the Google Cloud Platform SDK implementation for the Gemini Live API integration.

## Overview

The GCP services provide a comprehensive SDK management system that handles:

- Authentication (API key, service account, default)
- SDK initialization and configuration
- Live API session management
- Error handling and retry logic
- TypeScript support and type safety

## Core Components

### `gcp-sdk-manager.ts`

**Main SDK Manager** - Singleton pattern implementation for SDK management.

**Key Features:**

- Environment-based configuration loading
- Multiple authentication method support
- Live API session creation framework
- Comprehensive error handling
- TypeScript interfaces and type safety

**Usage:**

```typescript
import { initializeGCPSDK, getGCPSDK } from './gcp-sdk-manager'

// Initialize SDK
const sdkInstance = await initializeGCPSDK()

// Use SDK anywhere
const sdk = getGCPSDK()
const response = await sdk.genAI.models.generateContent(...)
```

### `gcp-auth-manager.ts`

**Authentication Manager** - Handles various authentication methods.

**Supported Methods:**

- `api-key`: Direct API key authentication (development)
- `service-account`: Service account JSON authentication (production)
- `ephemeral-token`: Client-side token authentication
- `default`: Google Cloud environment authentication

**Usage:**

```typescript
import {GCPAuthManager} from './gcp-auth-manager'

const authManager = new GCPAuthManager({
  method: 'api-key',
  apiKey: process.env.GEMINI_API_KEY
})

const result = await authManager.initialize()
if (result.success) {
  // Use authenticated credentials
}
```

## Configuration

### Environment Variables

The SDK automatically loads configuration from environment variables:

```env
# Primary API Key
GEMINI_API_KEY=AIzaSyYourApiKeyHere

# Alternative API Key Names
GOOGLE_AI_API_KEY=AIzaSyYourApiKeyHere
GOOGLE_API_KEY=AIzaSyYourApiKeyHere

# Service Account Authentication
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GCP_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Project Configuration
GCP_PROJECT_ID=your-project-id
GCP_REGION=us-central1
```

### SDK Configuration Options

```typescript
interface GCPSDKConfig {
  authMethod?: 'api-key' | 'service-account' | 'default' | 'auto'
  apiKey?: string
  serviceAccount?: {
    keyFile?: string
    credentials?: Record<string, unknown>
  }
  project?: {
    id?: string
    region?: string
  }
  geminiLive?: {
    model?: string
    enableNativeAudio?: boolean
    enableTextMode?: boolean
    websocketTimeout?: number
  }
  retryConfig?: {
    maxRetries?: number
    retryDelay?: number
    exponentialBackoff?: boolean
  }
  debug?: boolean
  logLevel?: 'error' | 'warn' | 'info' | 'debug'
}
```

## API Reference

### GCPSDKManager Methods

#### `getInstance(): GCPSDKManager`

Get the singleton SDK manager instance.

#### `initialize(config?: GCPSDKConfig): Promise<GCPSDKInstance>`

Initialize the SDK with optional configuration. Returns a promise that resolves to the SDK instance.

#### `createLiveSession(options): Promise<LiveSession>`

Create a Live API session for real-time communication.

#### `refreshCredentials(): Promise<void>`

Refresh authentication credentials when they expire.

#### `isInitialized(): boolean`

Check if the SDK has been initialized successfully.

### GCPSDKInstance Properties

```typescript
interface GCPSDKInstance {
  genAI: GoogleGenAI // Gen AI client for text generation
  auth: GoogleAuth // Google Auth client
  authResult: AuthResult // Authentication result and credentials
  config: GCPSDKConfig // Configuration used for initialization
  status: {
    initialized: boolean // SDK initialization status
    authenticated: boolean // Authentication status
    error?: string // Error message if initialization failed
  }
}
```

### Convenience Functions

```typescript
// Initialize SDK with environment config
const sdk = await initializeGCPSDK()

// Get initialized SDK instance
const sdk = getGCPSDK()

// Create Live API session
const session = await createGeminiLiveSession({
  model: 'gemini-2.5-flash-preview-native-audio-dialog',
  onMessage: message => console.log(message),
  onError: error => console.error(error)
})
```

## Error Handling

The SDK implements comprehensive error handling:

### Authentication Errors

- Invalid API keys
- Expired service account credentials
- Missing environment variables
- Network connectivity issues

### API Errors

- Rate limiting
- Invalid model names
- Malformed requests
- Service unavailability

### SDK Errors

- Initialization failures
- Configuration errors
- TypeScript compilation issues

### Error Examples

```typescript
try {
  const sdk = await initializeGCPSDK()
} catch (error) {
  if (error.message.includes('No API key found')) {
    // Handle missing API key
  } else if (error.message.includes('Authentication failed')) {
    // Handle authentication failure
  } else {
    // Handle other initialization errors
  }
}
```

## Testing

### Available Tests

1. **Authentication Tests** (`auth-test.mjs`)

   - API key authentication
   - Service account authentication
   - Environment configuration
   - Live API availability

2. **Basic API Tests** (`simple-api-test.mjs`)

   - SDK initialization
   - Text generation
   - Error handling
   - TypeScript compilation

3. **Comprehensive Test Suite** (`src/tests/basic-gemini-api-test.ts`)
   - Full SDK validation
   - Streaming generation
   - Live API interface
   - Configuration validation

### Running Tests

```bash
# Quick API test
node simple-api-test.mjs

# Authentication test
node auth-test.mjs

# Full test suite (requires TypeScript)
npx tsx src/tests/basic-gemini-api-test.ts
```

## Development Guidelines

### Adding New Features

1. **Extend interfaces** in `gcp-sdk-manager.ts`
2. **Add configuration options** to `GCPSDKConfig`
3. **Implement error handling** for new features
4. **Add tests** for new functionality
5. **Update documentation** accordingly

### Best Practices

1. **Use the singleton pattern** - don't create multiple SDK instances
2. **Handle errors gracefully** - implement retry logic and fallbacks
3. **Log appropriately** - use the configured log level
4. **Validate inputs** - check configuration and parameters
5. **Cache credentials** - avoid unnecessary authentication calls

### Code Style

- Use TypeScript for type safety
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Implement proper error handling
- Use async/await for promises

## Integration Examples

### Basic Text Generation

```typescript
import {getGCPSDK} from '@/services/gcp-sdk-manager'

async function generateText(prompt: string): Promise<string> {
  const sdk = getGCPSDK()
  if (!sdk) throw new Error('SDK not initialized')

  const response = await sdk.genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{parts: [{text: prompt}]}]
  })

  return response.candidates[0].content.parts[0].text
}
```

### Streaming Generation

```typescript
async function streamText(prompt: string, onChunk: (text: string) => void): Promise<void> {
  const sdk = getGCPSDK()
  if (!sdk) throw new Error('SDK not initialized')

  const stream = await sdk.genAI.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: [{parts: [{text: prompt}]}]
  })

  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
    if (text) onChunk(text)
  }
}
```

### Live API Session (Future Implementation)

```typescript
async function createAudioSession(): Promise<LiveSession> {
  const session = await createGeminiLiveSession({
    model: 'gemini-2.5-flash-preview-native-audio-dialog',
    enableNativeAudio: true,
    onMessage: message => {
      // Handle incoming messages
      console.log('Received:', message.type, message.data)
    },
    onError: error => {
      // Handle session errors
      console.error('Session error:', error.message)
    }
  })

  return session
}
```

## Deployment Considerations

### Production Setup

1. **Use service accounts** instead of API keys
2. **Set appropriate log levels** (error/warn for production)
3. **Configure retry policies** for reliability
4. **Monitor API usage** and set up alerts
5. **Implement health checks** for SDK connectivity

### Environment-Specific Configuration

```typescript
// Development
await initializeGCPSDK({
  authMethod: 'api-key',
  debug: true,
  logLevel: 'debug'
})

// Production
await initializeGCPSDK({
  authMethod: 'service-account',
  debug: false,
  logLevel: 'error',
  retryConfig: {
    maxRetries: 5,
    exponentialBackoff: true
  }
})
```

## Future Enhancements

### Planned Features

1. **WebSocket Management** - Connection pooling and management
2. **Audio Processing** - Real-time audio streaming capabilities
3. **Caching Layer** - Response caching for improved performance
4. **Metrics Collection** - Usage analytics and performance monitoring
5. **Advanced Error Recovery** - Automatic failover and circuit breakers

### Extension Points

- Add new authentication methods in `gcp-auth-manager.ts`
- Extend Live API capabilities in `gcp-sdk-manager.ts`
- Add new model support and configuration options
- Implement custom retry and error handling strategies

---

**Last Updated:** August 4, 2025  
**Maintainer:** DAO Copilot Development Team  
**Related Docs:** [Setup Guide](../docs/GCP_SDK_SETUP_GUIDE.md) | [Quick Reference](../docs/GCP_SDK_QUICK_REFERENCE.md)
