# GCP SDK Setup Guide for Gemini Live API

This guide provides step-by-step instructions for setting up the Google Cloud Platform (GCP) SDK and integrating the Gemini Live API into the DAO Copilot project.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Authentication Setup](#authentication-setup)
4. [Project Configuration](#project-configuration)
5. [Basic Usage](#basic-usage)
6. [Testing & Validation](#testing--validation)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)
9. [API Reference](#api-reference)

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v18 or higher)
- **npm** or **yarn** package manager
- **TypeScript** configured in your project
- A **Google Cloud Platform** account
- Access to **Gemini AI API** (API key or service account)

## Installation

### Step 1: Install Required Dependencies

The GCP SDK setup requires two main packages:

```bash
# Install Google Generative AI SDK
npm install @google/genai

# Install Google Auth Library (for advanced authentication)
npm install google-auth-library

# Install dotenv for environment variable management
npm install dotenv
```

### Step 2: Verify Installation

Check that the packages are installed correctly:

```bash
npm list @google/genai google-auth-library
```

Expected output:

```
├── @google/genai@1.12.0
└── google-auth-library@9.x.x
```

## Authentication Setup

### Option 1: API Key Authentication (Recommended for Development)

1. **Get your API Key:**

   - Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Create a new API key or use an existing one
   - Copy the API key (starts with `AIzaSy...`)

2. **Set Environment Variables:**
   Create or update your `.env` file:

   ```env
   # Primary API key (recommended)
   GEMINI_API_KEY=AIzaSyYourApiKeyHere

   # Alternative names (for compatibility)
   GOOGLE_AI_API_KEY=AIzaSyYourApiKeyHere
   GOOGLE_API_KEY=AIzaSyYourApiKeyHere
   ```

3. **Load Environment Variables:**
   Ensure your application loads the `.env` file:
   ```typescript
   import dotenv from 'dotenv'
   dotenv.config()
   ```

### Option 2: Service Account Authentication (Production)

1. **Create Service Account:**

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to IAM & Admin > Service Accounts
   - Create a new service account
   - Download the JSON key file

2. **Set Environment Variables:**

   ```env
   # Option A: File path
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

   # Option B: JSON content (for deployment)
   GCP_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

   # Project configuration
   GCP_PROJECT_ID=your-project-id
   ```

### Option 3: Default Authentication (Google Cloud Environment)

When running on Google Cloud Platform (Cloud Run, GKE, etc.), authentication can use the default service account:

```env
# No additional configuration needed
# The SDK will automatically use metadata server
```

## Project Configuration

### Step 1: TypeScript Configuration

Ensure your `tsconfig.json` supports the GCP SDK:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Step 2: Initialize GCP SDK Manager

The project includes a comprehensive SDK manager at `src/services/gcp-sdk-manager.ts`. Here's how to use it:

```typescript
import {initializeGCPSDK, getGCPSDK} from '@/services/gcp-sdk-manager'

// Initialize SDK with environment configuration
const sdkInstance = await initializeGCPSDK()

// Or with custom configuration
const sdkInstance = await initializeGCPSDK({
  authMethod: 'api-key',
  debug: true,
  geminiLive: {
    model: 'gemini-2.5-flash-preview-native-audio-dialog',
    enableNativeAudio: true
  }
})
```

### Step 3: Verify Setup

Run the included test to verify your setup:

```bash
# Run the simple API test
node simple-api-test.mjs

# Or run comprehensive tests
npx tsx src/tests/basic-gemini-api-test.ts
```

Expected output:

```
🎉 All tests passed!
✅ Basic API functionality is working correctly
```

## Basic Usage

### Text Generation

```typescript
import {getGCPSDK} from '@/services/gcp-sdk-manager'

const sdk = getGCPSDK()
if (!sdk) throw new Error('SDK not initialized')

const response = await sdk.genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [
    {
      parts: [{text: 'Hello, world!'}]
    }
  ]
})

console.log(response.candidates[0].content.parts[0].text)
```

### Streaming Generation

```typescript
const stream = await sdk.genAI.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: [
    {
      parts: [{text: 'Tell me a story'}]
    }
  ]
})

for await (const chunk of stream) {
  const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
  if (text) {
    process.stdout.write(text)
  }
}
```

### Live API Session (Future)

```typescript
import {createGeminiLiveSession} from '@/services/gcp-sdk-manager'

const session = await createGeminiLiveSession({
  model: 'gemini-2.5-flash-preview-native-audio-dialog',
  onMessage: message => {
    console.log('Received:', message)
  },
  onError: error => {
    console.error('Session error:', error)
  }
})

// Send audio data
await session.send({
  type: 'audio',
  data: audioBuffer
})
```

## Testing & Validation

### Automated Testing

The project includes comprehensive test suites:

1. **Authentication Tests:**

   ```bash
   node auth-test.mjs
   ```

2. **Basic API Tests:**

   ```bash
   node simple-api-test.mjs
   ```

3. **TypeScript Compilation:**
   ```bash
   npx tsc --noEmit
   ```

### Manual Validation

1. **Check Environment Variables:**

   ```bash
   echo $GEMINI_API_KEY
   # Should output your API key
   ```

2. **Test API Connection:**

   ```bash
   curl -H "Content-Type: application/json" \
        -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' \
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY"
   ```

3. **Verify Live API Support:**
   Check that the Live API interface is available in your SDK version.

## Troubleshooting

### Common Issues

#### 1. "No API key found" Error

**Problem:** Environment variables not loaded properly.

**Solutions:**

- Verify `.env` file exists and contains `GEMINI_API_KEY`
- Check that `dotenv.config()` is called before using the SDK
- Ensure `.env` is not in `.gitignore` if needed for deployment

#### 2. "Module not found" Errors

**Problem:** TypeScript import/export issues.

**Solutions:**

- Verify `@google/genai` is installed: `npm list @google/genai`
- Check TypeScript configuration supports ES modules
- Use dynamic imports if static imports fail

#### 3. "Authentication failed" Errors

**Problem:** Invalid API key or expired credentials.

**Solutions:**

- Verify API key is correct and active
- Check Google AI Studio for API key status
- Regenerate API key if necessary

#### 4. "Live API not available" Warning

**Problem:** Live API interface not found.

**Solutions:**

- Update to latest `@google/genai` version
- Verify model name is correct for Live API
- Check Google AI documentation for availability

#### 5. Rate Limiting Errors

**Problem:** Too many API requests.

**Solutions:**

- Implement exponential backoff retry logic
- Monitor API usage in Google Cloud Console
- Consider upgrading to paid plan for higher limits

### Debug Mode

Enable debug logging to troubleshoot issues:

```typescript
const sdkInstance = await initializeGCPSDK({
  debug: true,
  logLevel: 'debug'
})
```

This will output detailed information about:

- Authentication attempts
- API requests and responses
- Error details and stack traces

## Best Practices

### Security

1. **Never commit API keys** to version control
2. **Use service accounts** in production environments
3. **Rotate API keys** regularly
4. **Restrict API keys** to specific services/domains when possible
5. **Monitor API usage** for suspicious activity

### Performance

1. **Reuse SDK instances** - use the singleton pattern
2. **Implement connection pooling** for high-volume applications
3. **Cache authentication tokens** to reduce overhead
4. **Use streaming** for long responses
5. **Implement retry logic** with exponential backoff

### Development

1. **Use environment-specific configurations**
2. **Implement comprehensive error handling**
3. **Add logging and monitoring**
4. **Write unit tests** for SDK integration
5. **Document API usage** and rate limits

### Production Deployment

1. **Use service accounts** instead of API keys
2. **Set up proper logging** and monitoring
3. **Implement health checks** for SDK connectivity
4. **Configure auto-scaling** based on API usage
5. **Set up alerts** for error rates and quotas

## API Reference

### GCPSDKManager

Main SDK management class with singleton pattern.

#### Methods

- `getInstance()`: Get singleton instance
- `initialize(config?)`: Initialize SDK with configuration
- `createLiveSession(options)`: Create Live API session
- `refreshCredentials()`: Refresh authentication credentials

#### Configuration Options

```typescript
interface GCPSDKConfig {
  authMethod?: 'api-key' | 'service-account' | 'default' | 'auto'
  apiKey?: string
  serviceAccount?: {
    keyFile?: string
    credentials?: object
  }
  project?: {
    id?: string
    region?: string
  }
  geminiLive?: {
    model?: string
    enableNativeAudio?: boolean
    websocketTimeout?: number
  }
  debug?: boolean
  logLevel?: 'error' | 'warn' | 'info' | 'debug'
}
```

### Environment Variables

| Variable                         | Description                   | Example                         |
| -------------------------------- | ----------------------------- | ------------------------------- |
| `GEMINI_API_KEY`                 | Primary API key for Gemini AI | `AIzaSy...`                     |
| `GOOGLE_AI_API_KEY`              | Alternative API key name      | `AIzaSy...`                     |
| `GOOGLE_API_KEY`                 | Alternative API key name      | `AIzaSy...`                     |
| `GOOGLE_APPLICATION_CREDENTIALS` | Service account file path     | `/path/to/key.json`             |
| `GCP_SERVICE_ACCOUNT_KEY`        | Service account JSON content  | `{"type":"service_account"...}` |
| `GCP_PROJECT_ID`                 | Google Cloud project ID       | `my-project-123`                |

### Supported Models

#### Text Generation

- `gemini-2.5-flash` - Fast text generation
- `gemini-2.5-pro` - Advanced reasoning and analysis

#### Live API (Future)

- `gemini-2.5-flash-preview-native-audio-dialog` - Real-time audio processing
- `gemini-live-2.5-flash-preview` - Half-cascade processing

## Additional Resources

### Documentation

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API Documentation](https://ai.google.dev/docs)
- [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs)

### Support

- [Google AI Developer Forum](https://discuss.ai.google.dev/)
- [Stack Overflow - google-generative-ai](https://stackoverflow.com/questions/tagged/google-generative-ai)
- [GitHub Issues](https://github.com/google/generative-ai-js/issues)

---

**Last Updated:** August 4, 2025  
**Version:** 1.0.0  
**Compatibility:** @google/genai v1.12.0+
