---
title: Research Session
query: "Tool integration with Gemini Live API: google_search tool implementation, tool orchestration patterns, latency optimization with two-stage responses, streaming TTS with interruption handling, and error handling strategies for tool failures"
date: 8/27/2025
time: 8:41:14 PM
timestamp: 2025-08-27T17:41:14.739Z
exchanges: 1
---

# Research Session

## Initial Query

**Question:** Tool integration with Gemini Live API: google_search tool implementation, tool orchestration patterns, latency optimization with two-stage responses, streaming TTS with interruption handling, and error handling strategies for tool failures

**Response:**

# Research Response: Tool Integration with Gemini Live API

## 1. Google Search Tool Implementation

### 1.1 Overview

Implementing the Google Search tool integration with Gemini Live API is a critical component of the project, as outlined in Task 3. This integration will enable real-time search capabilities during live conversations, enhancing the AI assistant's ability to provide accurate and up-to-date information.

### 1.2 Implementation Details

Based on the project context, the implementation of the Google Search tool is already underway. Here's a detailed breakdown of the key components and considerations:

#### 1.2.1 API Setup

- Use the latest version of the Google Custom Search API
- Obtain necessary credentials (API key and Search Engine ID)
- Install required dependencies: `@google-cloud/functions-framework` and `axios`

#### 1.2.2 ToolCallHandler Class

The `ToolCallHandler` class is the core component for executing Google Search queries. Here's an expanded implementation with additional features:

```typescript
import axios from 'axios';

class ToolCallHandler {
  private apiKey: string;
  private searchEngineId: string;
  private baseUrl: string = 'https://www.googleapis.com/customsearch/v1';
  private maxRetries: number = 3;
  private retryDelay: number = 1000; // 1 second

  constructor(apiKey: string, searchEngineId: string) {
    this.apiKey = apiKey;
    this.searchEngineId = searchEngineId;
  }

  async executeGoogleSearch(query: string, numResults: number = 5): Promise<SearchResult[]> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        const response = await axios.get(this.baseUrl, {
          params: {
            key: this.apiKey,
            cx: this.searchEngineId,
            q: query,
            num: numResults
          }
        });

        return this.parseSearchResults(response.data);
      } catch (error) {
        retries++;
        if (retries >= this.maxRetries) {
          throw new Error(`Google Search failed after ${this.maxRetries} attempts: ${error.message}`);
        }
        await this.delay(this.retryDelay * retries);
      }
    }
  }

  private parseSearchResults(data: any): SearchResult[] {
    return data.items.map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink
    }));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}
```

This implementation includes:
- Retry mechanism for handling transient failures
- Parsing of search results into a structured format
- Configurable number of results to return

### 1.3 Integration with Gemini Live API

To integrate the Google Search tool with Gemini Live API, consider the following steps:

1. Define a tool configuration for Google Search in the Gemini API request:

```json
{
  "tools": [{
    "function_declarations": [{
      "name": "google_search",
      "description": "Search the web using Google Custom Search API",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query"
          },
          "num_results": {
            "type": "integer",
            "description": "Number of results to return (default: 5)"
          }
        },
        "required": ["query"]
      }
    }]
  }]
}
```

2. Implement a handler for tool calls in your application:

```typescript
async function handleToolCalls(toolCalls: any[]): Promise<any[]> {
  const results = [];
  for (const call of toolCalls) {
    if (call.function_name === 'google_search') {
      const { query, num_results = 5 } = call.args;
      const searchResults = await toolCallHandler.executeGoogleSearch(query, num_results);
      results.push({
        tool_call_id: call.id,
        output: JSON.stringify(searchResults)
      });
    }
  }
  return results;
}
```

3. Incorporate the tool call results into the Gemini API conversation:

```typescript
const response = await geminiApi.generateContent({
  contents: [
    { role: 'user', parts: [{ text: userQuery }] },
    { role: 'model', parts: [{ text: 'Certainly! Let me search for that information.' }] },
    { role: 'function', parts: [{ functionResponse: { response: JSON.stringify(toolCallResults) } }] }
  ],
  tools: [/* ... tool configurations ... */]
});
```

## 2. Tool Orchestration Patterns

### 2.1 Overview

Effective tool orchestration is crucial for managing multiple tools, including the Google Search integration, within the Gemini Live API ecosystem. The project context suggests a need for a robust orchestration system to handle various tools and their interactions.

### 2.2 Orchestration Patterns

#### 2.2.1 Chain of Responsibility Pattern

Implement a chain of tools that can handle different types of queries or tasks:

```typescript
abstract class ToolHandler {
  protected nextHandler: ToolHandler | null = null;

  setNext(handler: ToolHandler): ToolHandler {
    this.nextHandler = handler;
    return handler;
  }

  abstract handle(request: ToolRequest): Promise<ToolResponse>;
}

class GoogleSearchHandler extends ToolHandler {
  async handle(request: ToolRequest): Promise<ToolResponse> {
    if (request.type === 'google_search') {
      // Handle Google Search
      return this.executeGoogleSearch(request);
    } else if (this.nextHandler) {
      return this.nextHandler.handle(request);
    }
    throw new Error('No handler found for the request');
  }
}

// Additional tool handlers...

// Usage
const googleSearchHandler = new GoogleSearchHandler();
const otherToolHandler = new OtherToolHandler();
googleSearchHandler.setNext(otherToolHandler);

const orchestrator = new ToolOrchestrator(googleSearchHandler);
const result = await orchestrator.processRequest(toolRequest);
```

#### 2.2.2 Mediator Pattern

Use a central mediator to coordinate tool interactions:

```typescript
class ToolMediator {
  private tools: Map<string, ToolHandler> = new Map();

  registerTool(name: string, tool: ToolHandler) {
    this.tools.set(name, tool);
  }

  async executeTool(name: string, request: ToolRequest): Promise<ToolResponse> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    return tool.handle(request);
  }
}

// Usage
const mediator = new ToolMediator();
mediator.registerTool('google_search', new GoogleSearchHandler());
mediator.registerTool('other_tool', new OtherToolHandler());

const result = await mediator.executeTool('google_search', searchRequest);
```

#### 2.2.3 Strategy Pattern

Implement different strategies for tool selection based on context:

```typescript
interface ToolStrategy {
  selectTool(context: ConversationContext): ToolHandler;
}

class QuestionBasedToolStrategy implements ToolStrategy {
  selectTool(context: ConversationContext): ToolHandler {
    if (context.lastQuestion.includes('search')) {
      return new GoogleSearchHandler();
    }
    // Other tool selections...
  }
}

class ToolOrchestrator {
  private strategy: ToolStrategy;

  constructor(strategy: ToolStrategy) {
    this.strategy = strategy;
  }

  async processRequest(context: ConversationContext, request: ToolRequest): Promise<ToolResponse> {
    const selectedTool = this.strategy.selectTool(context);
    return selectedTool.handle(request);
  }
}
```

### 2.3 Integration with Existing Project Structure

To integrate these orchestration patterns with the existing project structure:

1. Extend the `ConversationManager` (Task 6) to include tool orchestration:

```typescript
class ConversationManager {
  // ... existing properties ...
  private toolOrchestrator: ToolOrchestrator;

  constructor(contextWindow: number = 5) {
    // ... existing initialization ...
    this.toolOrchestrator = new ToolOrchestrator(new QuestionBasedToolStrategy());
  }

  async processToolRequest(question: string): Promise<ToolResponse> {
    const context = this.getRecentContext();
    const request = this.createToolRequest(question);
    return this.toolOrchestrator.processRequest(context, request);
  }
}
```

2. Integrate with the `SearchService` (Task 4):

```typescript
class SearchService {
  private toolOrchestrator: ToolOrchestrator;

  constructor(toolOrchestrator: ToolOrchestrator) {
    this.toolOrchestrator = toolOrchestrator;
  }

  async executeSearch(question: string): Promise<SearchResult[]> {
    const optimizedQuery = this.optimizeSearchQuery(question);
    const request = { type: 'google_search', query: optimizedQuery };
    const response = await this.toolOrchestrator.processRequest(request);
    return this.parseSearchResults(response);
  }
}
```

## 3. Latency Optimization with Two-Stage Responses

### 3.1 Overview

To improve user experience and reduce perceived latency, implementing a two-stage response system can be highly effective. This approach involves providing an immediate, partial response followed by a more comprehensive answer.

### 3.2 Implementation Strategy

#### 3.2.1 Stage 1: Immediate Response

1. Implement a quick response generator:

```typescript
class QuickResponseGenerator {
  generateQuickResponse(question: string): string {
    // Use pre-defined templates or a lightweight model
    return `I'm looking into "${question}". Please give me a moment to find the most accurate information.`;
  }
}
```

2. Integrate with the AnswerDisplayManager (Task 5):

```typescript
class AnswerDisplayManager {
  private ws: WebSocket;
  private quickResponseGenerator: QuickResponseGenerator;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.quickResponseGenerator = new QuickResponseGenerator();
  }

  sendImmediateResponse(question: string) {
    const quickResponse = this.quickResponseGenerator.generateQuickResponse(question);
    this.ws.send(JSON.stringify({
      type: 'immediate_response',
      content: quickResponse
    }));
  }
}
```

#### 3.2.2 Stage 2: Comprehensive Response

1. Enhance the SearchService to provide incremental updates:

```typescript
class SearchService {
  // ... existing properties ...

  async executeSearch(question: string, updateCallback: (update: string) => void): Promise<SearchResult[]> {
    updateCallback('Optimizing search query...');
    const optimizedQuery = this.optimizeSearchQuery(question);
    
    updateCallback('Executing Google Search...');
    const searchResults = await this.toolCallHandler.executeGoogleSearch(optimizedQuery);
    
    updateCallback('Analyzing search results...');
    const analyzedResults = this.analyzeSearchResults(searchResults);
    
    return analyzedResults;
  }
}
```

2. Update the AnswerDisplayManager to handle incremental updates:

```typescript
class AnswerDisplayManager {
  // ... existing methods ...

  sendIncrementalUpdate(update: string) {
    this.ws.send(JSON.stringify({
      type: 'incremental_update',
      content: update
    }));
  }

  sendFinalResponse(answer: string) {
    this.ws.send(JSON.stringify({
      type: 'final_response',
      content: answer
    }));
  }
}
```

3. Implement the two-stage response in the main processing pipeline:

```typescript
async function processQuestion(question: string) {
  const displayManager = new AnswerDisplayManager(websocketConnection);
  const searchService = new SearchService(toolCallHandler);

  // Stage 1: Immediate Response
  displayManager.sendImmediateResponse(question);

  // Stage 2: Comprehensive Response
  const searchResults = await searchService.executeSearch(question, (update) => {
    displayManager.sendIncrementalUpdate(update);
  });

  const finalAnswer = await synthesizeAnswer(searchResults);
  displayManager.sendFinalResponse(finalAnswer);
}
```

### 3.3 Latency Optimization Techniques

1. Caching: Implement a cache for frequent searches to reduce API calls.
2. Parallel Processing: Execute multiple tool calls concurrently when applicable.
3. Progressive Loading: Display search results as they become available.
4. Predictive Prefetching: Anticipate follow-up questions and preload relevant data.

## 4. Streaming TTS with Interruption Handling

### 4.1 Overview

Implementing streaming Text-to-Speech (TTS) with interruption handling is crucial for creating a responsive and natural conversational experience. This feature builds upon the Voice Activity Detection (VAD) integration from Task 1.

### 4.2 Implementation Strategy

#### 4.2.1 Streaming TTS Setup

1. Set up a streaming TTS service using Google Cloud Text-to-Speech API:

```typescript
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

class StreamingTTSService {
  private client: TextToSpeechClient;

  constructor() {
    this.client = new TextToSpeechClient();
  }

  async streamAudio(text: string, onData: (chunk: Buffer) => void, onEnd: () => void) {
    const request = {
      input: { text },
      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'LINEAR16' },
    };

    const [response] = await this.client.synthesizeSpeech(request);
    const audioContent = response.audioContent as Buffer;

    // Simulate streaming by sending chunks
    const chunkSize = 1024;
    for (let i = 0; i < audioContent.length; i += chunkSize) {
      const chunk = audioContent.slice(i, i + chunkSize);
      onData(chunk);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network delay
    }
    onEnd();
  }
}
```

#### 4.2.2 Interruption Handling

2. Enhance the VADManager to detect user interruptions:

```typescript
class VADManager {
  // ... existing properties ...
  private interruptionCallback: () => void;

  setInterruptionCallback(callback: () => void) {
    this.interruptionCallback = callback;
  }

  private handleAudioStream(audioChunk: Buffer) {
    // Existing VAD logic...
    if (this.detectSpeech(audioChunk)) {
      this.interruptionCallback();
    }
  }
}
```

3. Implement an InterruptibleTTSManager:

```typescript
class InterruptibleTTSManager {
  private ttsService: StreamingTTSService;
  private vadManager: VADManager;
  private isPlaying: boolean = false;
  private audioQueue: string[] = [];

  constructor(ttsService: StreamingTTSService, vadManager: VADManager) {
    this.ttsService = ttsService;
    this.vadManager = vadManager;
    this.vadManager.setInterruptionCallback(this.handleInterruption.bind(this));
  }

  async playAudio(text: string) {
    this.audioQueue.push(text);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const text = this.audioQueue.shift()!;

    await this.ttsService.streamAudio(
      text,
      (chunk) => this.handleAudioChunk(chunk),
      () => this.playNext()
    );
  }

  private handleAudioChunk(chunk: Buffer) {
    // Send audio chunk to audio output
    // This is where you'd interface with the audio playback system
  }

  private handleInterruption() {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.audioQueue = []; // Clear remaining audio
      // Stop audio playback
      // This is where you'd interface with the audio playback system to stop
    }
  }
}
```

### 4.3 Integration with Existing Project Structure

To integrate the streaming TTS with interruption handling into the project:

1. Update the AnswerDisplayManager to include audio output:

```typescript
class AnswerDisplayManager {
  // ... existing properties ...
  private ttsManager: InterruptibleTTSManager;

  constructor(ws: WebSocket, ttsManager: InterruptibleTTSManager) {
    // ... existing initialization ...
    this.ttsManager = ttsManager;
  }

  sendFinalResponse(answer: string) {
    this.ws.send(JSON.stringify({
      type: 'final_response',
      content: answer
    }));
    this.ttsManager.playAudio(answer);
  }
}
```

2. Initialize the TTS components in the main application setup:

```typescript
const ttsService = new StreamingTTSService();
const vadManager = new VADManager();
const interruptibleTTSManager = new InterruptibleTTSManager(ttsService, vadManager);
const answerDisplayManager = new AnswerDisplayManager(websocketConnection, interruptibleTTSManager);
```

## 5. Error Handling Strategies for Tool Failures

### 5.1 Overview

Robust error handling is crucial for maintaining a smooth user experience, especially when dealing with external tools like the Google Search API. The project context, particularly Task 3, emphasizes the need for comprehensive error handling.

### 5.2 Implementation Strategies

#### 5.2.1 Centralized Error Handling

Implement a centralized error handling system:

```typescript
class ErrorHandler {
  static handle(error: Error, context: string): void {
    console.error(`Error in ${context}:`, error);
    // Log to monitoring system
    // Notify developers if critical
  }

  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    throw new Error('Max retries reached');
  }
}
```

#### 5.2.2 Tool-Specific Error Handling

Enhance the ToolCallHandler with specific error handling:

```typescript
class ToolCallHandler {
  // ... existing methods ...

  async executeGoogleSearch(query: string): Promise<SearchResult[]> {
    try {
      return await ErrorHandler.retry(() => this.performSearch(query));
    } catch (error) {
      ErrorHandler.handle(error, 'Google Search');
      throw new ToolError('Google Search failed', error);
    }
  }

  private async performSearch(query: string): Promise<SearchResult[]> {
    // Actual API call implementation
  }
}

class ToolError extends Error {
  constructor(message: string, public originalError: Error) {
    super(message);
    this.name = 'ToolError';
  }
}
```

#### 5.2.3 Graceful Degradation

Implement fallback mechanisms for tool failures:

```typescript
class SearchService {
  // ... existing properties ...
  private fallbackSearchProvider: FallbackSearchProvider;

  async executeSearch(query: string): Promise<SearchResult[]> {
    try {
      return await this.toolCallHandler.executeGoogleSearch(query);
    } catch (error) {
      console.warn('Primary search failed, using fallback', error);
      return this.fallbackSearchProvider.search(query);
    }
  }
}

class FallbackSearchProvider {
  async search(query: string): Promise<SearchResult[]> {
    // Implement a simpler, more reliable search method
    // This could be a different API, a local database, or pre-cached results
  }
}
```

#### 5.2.4 User-Facing Error Messages

Create a system for generating user-friendly error messages:

```typescript
class UserErrorMessageGenerator {
  static generate(error: Error): string {
    if (error instanceof ToolError) {
      return "I'm having trouble accessing the latest information. Let me try a different approach.";
    }
    return "I apologize, but I'm experiencing a technical issue. Could you please rephrase your question?";
  }
}

class AnswerDisplayManager {
  // ... existing methods ...

  displayError(error: Error) {
    const userMessage = UserErrorMessageGenerator.generate(error);
    this.ws.send(JSON.stringify({
      type: 'error',
      content: userMessage
    }));
  }
}
```

### 5.3 Integration with Existing Project Structure

To integrate these error handling strategies:

1. Update the main question processing pipeline:

```typescript
async function processQuestion(question: string) {
  const displayManager = new AnswerDisplayManager(websocketConnection);
  const searchService = new SearchService(toolCallHandler, new FallbackSearchProvider());

  try {
    displayManager.sendImmediateResponse(question);

    const searchResults = await ErrorHandler.retry(() => 
      searchService.executeSearch(question, (update) => {
        displayManager.sendIncrementalUpdate(update);
      })
    );

    const finalAnswer = await synthesizeAnswer(searchResults);
    displayManager.sendFinalResponse(finalAnswer);
  } catch (error) {
    ErrorHandler.handle(error, 'Question Processing');
    displayManager.displayError(error);
  }
}
```

2. Enhance the ConversationManager to handle errors gracefully:

```typescript
class ConversationManager {
  // ... existing methods ...

  async addTurn(question: string, answer: string) {
    try {
      this.history.push({ question, answer, timestamp: Date.now() });
      await this.persistConversation();
    } catch (error) {
      ErrorHandler.handle(error, 'Conversation Persistence');
      // Continue without persisting, but log the issue
    }
  }
}
```

## Conclusion

This comprehensive research response addresses the key aspects of tool integration with Gemini Live API, focusing on the Google Search tool implementation, tool orchestration patterns, latency optimization with two-stage responses, streaming TTS with interruption handling, and error handling strategies for tool failures.

The proposed solutions are tailored to fit the existing project structure and tasks, providing actionable insights and code examples that can be directly integrated into the current implementation. By adopting these strategies, the project can achieve a more robust, responsive, and user-friendly AI assistant capable of handling real-time conversations with efficient tool usage and graceful error management.

To further improve the system, consider the following next steps:

1. Implement comprehensive unit and integration tests for all new components.
2. Conduct performance benchmarks to identify and optimize bottlenecks.
3. Develop a monitoring and logging system to track tool usage and errors in production.
4. Create a user feedback mechanism to continuously improve the AI assistant's responses and error handling.

By iteratively refining these implementations and closely monitoring their performance in real-world scenarios, the project can evolve into a highly effective and reliable conversational AI system.


---

*Generated by Task Master Research Command*  
*Timestamp: 2025-08-27T17:41:14.739Z*
