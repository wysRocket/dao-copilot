# GCP SDK Quick Reference

Quick reference for common GCP SDK operations in the DAO Copilot project.

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy your API key to .env
echo "GEMINI_API_KEY=your_api_key_here" >> .env
```

### 2. Basic Usage

```typescript
import {initializeGCPSDK, getGCPSDK} from '@/services/gcp-sdk-manager'

// Initialize once
await initializeGCPSDK()

// Use anywhere
const sdk = getGCPSDK()
const response = await sdk.genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{parts: [{text: 'Hello!'}]}]
})
```

### 3. Test Setup

```bash
# Quick test
node simple-api-test.mjs

# Full test suite
node auth-test.mjs
```

## 📝 Common Code Patterns

### Text Generation

```typescript
const sdk = getGCPSDK()
const result = await sdk.genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [{parts: [{text: prompt}]}]
})
const text = result.candidates[0].content.parts[0].text
```

### Streaming Generation

```typescript
const stream = await sdk.genAI.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: [{parts: [{text: prompt}]}]
})

for await (const chunk of stream) {
  const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
  if (text) console.log(text)
}
```

### Error Handling

```typescript
try {
  const response = await sdk.genAI.models.generateContent(...)
} catch (error) {
  if (error.message.includes('API_KEY_INVALID')) {
    // Handle authentication error
  } else if (error.message.includes('RATE_LIMIT')) {
    // Handle rate limiting
  } else {
    // Handle other errors
  }
}
```

## 🔧 Configuration Options

### Development Config

```typescript
await initializeGCPSDK({
  authMethod: 'api-key',
  debug: true,
  logLevel: 'debug'
})
```

### Production Config

```typescript
await initializeGCPSDK({
  authMethod: 'service-account',
  debug: false,
  logLevel: 'error',
  project: {id: 'your-project-id'}
})
```

## 🔍 Debugging

### Check SDK Status

```typescript
const manager = GCPSDKManager.getInstance()
console.log('Initialized:', manager.isInitialized())

const sdk = manager.getInstance()
console.log('Status:', sdk?.status)
console.log('Auth Method:', sdk?.authResult.method)
```

### Environment Variables

```bash
# Check if API key is set
echo $GEMINI_API_KEY

# Test API key directly
curl -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"test"}]}]}' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY"
```

## ⚡ Performance Tips

1. **Reuse SDK instance** - don't initialize multiple times
2. **Use streaming** for long responses
3. **Implement retry logic** with exponential backoff
4. **Cache responses** when appropriate
5. **Monitor rate limits** and implement queuing

## 🚨 Troubleshooting

| Error                    | Solution                                |
| ------------------------ | --------------------------------------- |
| "No API key found"       | Check `.env` file and `dotenv.config()` |
| "Module not found"       | Run `npm install @google/genai`         |
| "Authentication failed"  | Verify API key in Google AI Studio      |
| "Rate limit exceeded"    | Implement retry with backoff            |
| "Live API not available" | Update SDK version or check model name  |

## 📚 File Structure

```
src/
├── services/
│   ├── gcp-sdk-manager.ts      # Main SDK manager
│   └── gcp-auth-manager.ts     # Authentication handling
├── tests/
│   └── basic-gemini-api-test.ts # Test suite
└── ...

# Test files (project root)
├── simple-api-test.mjs         # Quick API test
├── auth-test.mjs              # Authentication test
└── .env                       # Environment variables
```

## 🔗 Useful Links

- [Full Setup Guide](./GCP_SDK_SETUP_GUIDE.md)
- [Google AI Studio](https://aistudio.google.com/app/apikey)
- [Gemini API Docs](https://ai.google.dev/docs)

---

_For detailed information, see the [complete setup guide](./GCP_SDK_SETUP_GUIDE.md)_
