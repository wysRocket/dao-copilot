# AI Answering Machine with Tool Calling Integration

A sophisticated AI assistant system that combines **Voice Activity Detection (VAD)**, **Question Detection**, and **Real-time Tool Calling** with Google Search through the Gemini Live API.

## 🚀 Overview

This system creates an intelligent AI answering machine that can:

- **Listen** to voice input with Voice Activity Detection
- **Detect** questions in real-time with high accuracy
- **Search** for current information using Google Search API
- **Respond** with comprehensive, well-sourced answers via Gemini Live API
- **Handle** complex multi-part questions and conversations
- **Cache** results for improved performance
- **Manage** interruptions and conversation flow

## 🏗️ Architecture

### Three-Layer Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 AI Answering Machine                        │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Integration Orchestration                        │
│  ├── GeminiToolCallIntegrationService                      │
│  ├── Question Detection Pipeline                           │
│  ├── Conversation Management                               │
│  └── Statistics & Event Handling                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Enhanced Services                                │
│  ├── EnhancedGeminiLiveIntegration                         │
│  ├── ToolCallHandler (Google Search)                       │
│  ├── Multi-part Question Processing                        │
│  └── Caching & Performance                                 │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Core Infrastructure                              │
│  ├── ToolEnabledGeminiLiveWebSocketClient                  │
│  ├── QuestionDetector                                      │
│  ├── TranscriptionQuestionPipeline                         │
│  └── VAD Integration                                       │
└─────────────────────────────────────────────────────────────┘
```

## 📁 File Structure

### Core Services
```
src/services/
├── gemini-tool-call-integration.ts        # Complete integration service
├── enhanced-gemini-live-integration.ts    # Enhanced Gemini service
├── tool-enabled-gemini-websocket.ts      # Tool-enabled WebSocket client  
├── tool-call-handler.ts                  # Google Search handler
├── gemini-live-websocket.ts             # Base WebSocket client
├── question-detector.ts                 # Question detection
└── transcription-question-pipeline.ts   # Pipeline integration
```

### Testing & Examples
```
tests/
├── gemini-tool-call-integration.test.ts  # Comprehensive test suite
├── test-tool-call-handler.mjs           # Tool handler tests
└── validate-tool-call-handler.js        # Validation tests

examples/
├── ai-answering-machine-tool-calling-demo.js  # Complete demo
└── tool-call-integration-examples/            # Usage examples
```

## 🛠️ Setup & Configuration

### 1. Environment Variables

Create a `.env` file in your project root:

```env
# Google API Keys
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_SEARCH_API_KEY=your_google_search_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here

# Optional: Alternative Gemini key
GOOGLE_API_KEY=your_google_api_key_here
```

### 2. Google Search Setup

1. **Enable Custom Search API**:
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Custom Search API
   - Create API credentials

2. **Create Custom Search Engine**:
   - Go to [Custom Search Engine](https://cse.google.com/cse/)
   - Create a new search engine
   - Note your Search Engine ID

### 3. Installation

```bash
# Install dependencies
npm install

# Run the demo
node examples/ai-answering-machine-tool-calling-demo.js
```

## 🎯 Key Features

### Real-time Tool Calling
- **Automatic Search Detection**: Questions requiring current information trigger Google Search
- **Parallel Processing**: Handle multiple tool calls concurrently
- **Retry Logic**: Automatic retry for failed searches
- **Timeout Management**: Configurable timeouts for tool execution

### Advanced Question Processing
- **Multi-part Questions**: Handle complex questions with multiple components
- **Context Awareness**: Maintain conversation history for better understanding
- **Confidence Scoring**: Only process high-confidence questions
- **Buffer Management**: Collect complete thoughts before processing

### Performance & Reliability
- **Intelligent Caching**: 30-minute TTL for search results
- **Quota Management**: Track and manage API usage
- **Rate Limiting**: Prevent API quota exhaustion
- **Error Recovery**: Graceful handling of failures

### Voice Integration
- **VAD Integration**: Seamless voice activity detection
- **Transcription Pipeline**: Real-time speech-to-text processing
- **Audio Responses**: Optional audio response generation
- **Interruption Handling**: Manage conversation interruptions

## 💻 Usage Examples

### Basic Integration

```typescript
import { GeminiToolCallIntegrationService } from './services/gemini-tool-call-integration.js';

const service = new GeminiToolCallIntegrationService({
  gemini: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-live-2.5-flash-preview'
  },
  googleSearch: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY!,
    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID!,
    enableCaching: true
  }
});

// Connect and start processing
await service.connect();

// Process voice transcription
await service.processTranscription({
  transcript: "What's the latest news about AI?",
  isFinal: true,
  confidence: 0.95
});
```

### Event-Driven Processing

```typescript
// Question detected
service.on('questionDetected', (data) => {
  console.log(`Question: ${data.text} (${data.questionType})`);
});

// Tool call started
service.on('toolCallStarted', (data) => {
  console.log(`Executing: ${data.name}`);
});

// Search results
service.on('searchCompleted', (data) => {
  console.log(`Found ${data.resultCount} results for: ${data.query}`);
});

// AI response
service.on('response', (data) => {
  console.log(`Assistant: ${data.text}`);
});
```

### Advanced Configuration

```typescript
const config = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY!,
    model: 'gemini-live-2.5-flash-preview',
    responseModalities: [ResponseModality.TEXT, ResponseModality.AUDIO],
    systemInstruction: 'Your custom system instruction...'
  },
  googleSearch: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY!,
    searchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID!,
    enableCaching: true,
    cacheTtlSeconds: 1800,
    maxResultsPerQuery: 10,
    timeout: 15000
  },
  questionDetection: {
    enabled: true,
    minConfidence: 0.8,
    bufferTimeMs: 2000,
    enableContextProcessing: true
  },
  toolCalling: {
    autoExecute: true,
    maxConcurrentCalls: 3,
    callTimeout: 20000,
    retryFailedCalls: true,
    maxRetries: 3
  }
};
```

## 🔧 Tool Call Handler Features

### Google Search Integration
- **Comprehensive Results**: Title, snippet, URL, metadata
- **Result Filtering**: Remove duplicates and low-quality results  
- **Source Attribution**: Automatic citation generation
- **Safe Search**: Built-in content filtering
- **Response Formatting**: Structured data for AI processing

### Caching System
- **Intelligent Caching**: TTL-based cache with automatic expiration
- **Cache Statistics**: Hit/miss ratios and performance metrics
- **Memory Management**: Automatic cache cleanup
- **Cache Invalidation**: Manual cache clearing when needed

### Error Handling
- **Quota Management**: Track daily usage limits
- **Rate Limiting**: Prevent API abuse
- **Retry Logic**: Exponential backoff for failed requests
- **Fallback Strategies**: Graceful degradation when search fails

## 📊 Monitoring & Statistics

### Real-time Statistics
```typescript
const stats = service.getStatistics();

console.log({
  quota: {
    used: stats.quota.used,
    limit: stats.quota.limit,
    usagePercent: stats.quota.usagePercent
  },
  cache: {
    hits: stats.cache.hits,
    misses: stats.cache.misses,
    hitRate: stats.cache.hitRate
  },
  performance: {
    averageResponseTime: stats.performance.averageResponseTime,
    totalRequests: stats.performance.totalRequests
  }
});
```

### Event Monitoring
- **Connection Events**: Connect/disconnect tracking
- **Tool Call Events**: Request, start, completion tracking
- **Search Events**: Query execution and result tracking
- **Error Events**: Comprehensive error logging
- **Performance Events**: Response time and quota monitoring

## 🧪 Testing

### Run Test Suite
```bash
# Run comprehensive integration tests
npm test gemini-tool-call-integration.test.ts

# Run tool handler tests
node tests/test-tool-call-handler.mjs

# Validate tool call handler
node tests/validate-tool-call-handler.js
```

### Test Coverage
- **Unit Tests**: Individual component testing
- **Integration Tests**: Service interaction testing
- **End-to-End Tests**: Complete workflow testing
- **Mock Testing**: Isolated component testing
- **Performance Tests**: Response time and reliability

## 🚀 Running the Demo

The complete demo showcases all features:

```bash
node examples/ai-answering-machine-tool-calling-demo.js
```

### Demo Scenarios
1. **Current Events**: "What are the latest developments in AI?"
2. **Factual Questions**: "What is the population of Tokyo?"
3. **Multi-part Questions**: "What is machine learning and its applications?"
4. **Technical Questions**: "How do large language models work?"
5. **General Knowledge**: "What is 25 multiplied by 4?" (no search needed)
6. **Creative Requests**: "Write a poem about coding" (no search needed)

## 🔄 Integration Points

### With Existing Systems
- **VAD Integration**: Seamless voice activity detection
- **Transcription Services**: Real-time speech-to-text
- **Question Detection**: Intelligent question identification
- **Conversation Management**: Multi-turn conversation handling

### API Compatibility
- **Gemini Live API**: Full WebSocket integration
- **Google Search API**: Custom Search JSON API v1
- **Event-Driven Architecture**: Observable pattern implementation
- **TypeScript Support**: Full type safety and IntelliSense

## ⚡ Performance Optimizations

### Caching Strategy
- **Search Result Caching**: 30-minute TTL for repeated queries
- **Conversation History Caching**: Efficient memory management
- **Tool Call Result Caching**: Avoid duplicate executions

### Concurrent Processing
- **Parallel Tool Calls**: Multiple searches simultaneously
- **Async Processing**: Non-blocking operation handling
- **Queue Management**: Efficient request queuing
- **Resource Pooling**: Optimized connection management

### Error Recovery
- **Automatic Retries**: Exponential backoff for failures
- **Fallback Mechanisms**: Alternative response strategies
- **Circuit Breaker**: Prevent cascade failures
- **Graceful Degradation**: Continue operation despite failures

## 🛡️ Security & Privacy

### API Security
- **Key Management**: Secure environment variable handling
- **Request Validation**: Input sanitization and validation
- **Rate Limiting**: Prevent abuse and quota exhaustion
- **Error Sanitization**: No sensitive data in error messages

### Data Privacy
- **Conversation Logging**: Optional, configurable logging
- **Search Query Privacy**: No persistent search query storage
- **Audio Handling**: Temporary audio data processing
- **Cache Management**: Automatic cache expiration

## 🔍 Troubleshooting

### Common Issues

1. **Missing API Keys**:
   ```
   Missing required API credentials:
   - GEMINI_API_KEY: ✗
   - GOOGLE_SEARCH_API_KEY: ✗  
   - GOOGLE_SEARCH_ENGINE_ID: ✗
   ```
   **Solution**: Check your `.env` file configuration

2. **Search API Quota Exceeded**:
   ```
   Error: Quota exceeded for Custom Search API
   ```
   **Solution**: Check your Google Cloud Console quota limits

3. **WebSocket Connection Fails**:
   ```
   Error: WebSocket connection failed
   ```
   **Solution**: Verify Gemini API key and network connectivity

4. **Tool Call Timeout**:
   ```
   Error: Tool call timed out after 15000ms
   ```
   **Solution**: Check network connectivity and adjust timeout settings

### Debug Mode
```typescript
// Enable detailed logging
const service = new GeminiToolCallIntegrationService(config);
service.enableDebugLogging();
```

### Performance Monitoring
```typescript
// Monitor active tool calls
const activeToolCalls = service.getActiveToolCalls();
console.log(`Active tool calls: ${activeToolCalls.length}`);

// Check connection state
const connectionState = service.getConnectionState();
console.log(`Connection: ${connectionState}`);
```

## 📚 API Reference

### Core Methods

#### `GeminiToolCallIntegrationService`
```typescript
// Connection management
async connect(): Promise<void>
async disconnect(): Promise<void>
destroy(): void

// Processing
async processTranscription(data: TranscriptionData): Promise<void>
async processAudioChunk(chunk: Uint8Array): Promise<void>

// Statistics
getStatistics(): IntegrationStatistics
getActiveToolCalls(): ToolCallExecution[]
getConnectionState(): string
```

#### `ToolCallHandler`
```typescript
// Search execution
async executeGoogleSearch(query: string): Promise<GoogleSearchResult>

// Cache management
getCacheStatistics(): CacheStatistics
clearCache(): void

// Configuration
getConfiguration(): ToolCallHandlerConfig
updateConfiguration(updates: Partial<ToolCallHandlerConfig>): void
```

### Event Types

```typescript
// Connection events
'connected' | 'disconnected' | 'error'

// Processing events  
'transcription' | 'questionDetected' | 'response' | 'audioResponse'

// Tool call events
'toolCallRequested' | 'toolCallStarted' | 'toolCallCompleted'

// Search events
'searchStarted' | 'searchCompleted' | 'searchFailed'
```

## 🏆 Best Practices

### Configuration
- Use environment variables for API keys
- Set appropriate timeouts for your use case
- Configure caching based on your query patterns
- Monitor quota usage regularly

### Error Handling
- Implement proper error boundaries
- Use event listeners for error monitoring
- Provide fallback responses for search failures
- Log errors for debugging and monitoring

### Performance
- Enable caching for repeated queries
- Use appropriate confidence thresholds
- Monitor active tool call counts
- Implement proper cleanup procedures

### Security
- Never commit API keys to version control
- Use secure key management systems
- Validate all input data
- Implement proper access controls

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section above
- Review the comprehensive test suite for usage examples

---

**🎉 You now have a complete AI answering machine with real-time tool calling capabilities!** 

The system seamlessly integrates voice activity detection, question detection, Google Search, and Gemini Live API to create an intelligent assistant that can answer questions with current, accurate information.