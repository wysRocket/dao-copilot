/**
 * Enhanced Gemini Live Integration with Tool Calling Support
 * 
 * This service extends the existing Gemini Live API integration to support
 * tool calling functionality, specifically for Google Search integration
 * in the AI answering machine system.
 */

import { EventEmitter } from 'events';
import GeminiLiveWebSocketClient, { 
  type GeminiLiveConfig, 
  type RealtimeInput, 
  ConnectionState,
  ResponseModality,
  type ParsedGeminiResponse
} from './gemini-live-websocket.js';
import { ToolCallHandler } from './tool-call-handler.js';
import { QuestionDetector } from './question-detector.js';
import { logger } from './gemini-logger.js';

// Enhanced configuration interface with tool calling support
export interface EnhancedGeminiLiveConfig extends GeminiLiveConfig {
  // Tool calling configuration
  toolCalling?: {
    enabled: boolean;
    autoExecute: boolean; // Automatically execute detected tool calls
    maxConcurrentCalls: number;
    callTimeout: number;
  };
  
  // Google Search API configuration
  googleSearch?: {
    apiKey: string;
    searchEngineId: string;
    enableCaching: boolean;
    cacheTtlSeconds: number;
    maxResultsPerQuery: number;
  };
  
  // Question detection configuration
  questionDetection?: {
    enabled: boolean;
    minConfidence: number;
    bufferTimeMs: number;
    enableContextProcessing: boolean;
  };
}

// Tool call definition interface
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      required?: boolean;
    }>;
    required: string[];
  };
}

// Tool call request interface
export interface ToolCallRequest {
  id: string;
  name: string;
  parameters: Record<string, any>;
  timestamp: number;
}

// Tool call result interface
export interface ToolCallResult {
  id: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: number;
  executionTime: number;
}

// Enhanced conversation turn with tool call support
export interface EnhancedConversationTurn {
  id: string;
  type: 'user' | 'model';
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRequest[];
  toolResults?: ToolCallResult[];
  metadata?: {
    confidence?: number;
    source?: string;
    questionType?: string;
    wasInterrupted?: boolean;
  };
}

/**
 * Enhanced Gemini Live Integration Service with Tool Calling Support
 */
export class EnhancedGeminiLiveIntegration extends EventEmitter {
  private websocketClient: GeminiLiveWebSocketClient;
  private toolCallHandler: ToolCallHandler | null = null;
  private questionDetector: QuestionDetector | null = null;
  private config: EnhancedGeminiLiveConfig;
  private conversationHistory: EnhancedConversationTurn[] = [];
  private pendingToolCalls = new Map<string, ToolCallRequest>();
  private isProcessingToolCall = false;
  
  // Tool definitions for Gemini Live API
  private toolDefinitions: ToolDefinition[] = [];

  constructor(config: EnhancedGeminiLiveConfig) {
    super();
    this.config = config;
    
    // Create WebSocket client with enhanced system instruction
    const websocketConfig: GeminiLiveConfig = {
      ...config,
      systemInstruction: this.createEnhancedSystemInstruction(config.systemInstruction)
    };
    
    this.websocketClient = new GeminiLiveWebSocketClient(websocketConfig);
    
    this.setupWebSocketEvents();
    this.initializeServices();
  }

  /**
   * Initialize additional services based on configuration
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize tool call handler if Google Search is configured
      if (this.config.toolCalling?.enabled && this.config.googleSearch) {
        const { apiKey, searchEngineId, ...searchConfig } = this.config.googleSearch;
        
        this.toolCallHandler = new ToolCallHandler({
          apiKey,
          searchEngineId,
          ...searchConfig
        });
        
        await this.setupToolDefinitions();
        logger.info('Tool call handler initialized successfully');
      }

      // Initialize question detector if enabled
      if (this.config.questionDetection?.enabled) {
        this.questionDetector = new QuestionDetector();
        logger.info('Question detector initialized successfully');
      }

    } catch (error) {
      logger.error('Failed to initialize enhanced services', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Create enhanced system instruction with tool calling context
   */
  private createEnhancedSystemInstruction(baseInstruction?: string): string {
    const toolCallContext = this.config.toolCalling?.enabled ? `

You have access to tool calling capabilities to enhance your responses:

1. **Google Search Tool**: When users ask questions that would benefit from up-to-date information, current events, specific facts, or research, use the google_search tool to find relevant information.

2. **Tool Calling Guidelines**:
   - Use tools when the question requires current, specific, or factual information
   - Don't use tools for general knowledge, creative tasks, or personal opinions
   - Always integrate tool results naturally into your response
   - If a tool call fails, acknowledge it and provide the best answer you can

3. **Google Search Usage**:
   - Extract key terms from the user's question for the search query
   - Use 3-8 results for comprehensive answers
   - Cite sources when providing information from search results

4. **Response Quality**:
   - Provide direct, helpful answers
   - Include relevant details from search results
   - Maintain conversational tone while being informative` : '';

    const baseText = baseInstruction || 'You are a helpful AI assistant that can provide accurate and up-to-date information.';
    
    return `${baseText}${toolCallContext}

Always respond in a natural, conversational manner while being helpful and accurate.`;
  }

  /**
   * Setup tool definitions for Gemini Live API
   */
  private async setupToolDefinitions(): Promise<void> {
    if (!this.config.toolCalling?.enabled) return;

    // Define Google Search tool
    const googleSearchTool: ToolDefinition = {
      name: 'google_search',
      description: 'Search the web using Google Custom Search API to find current information, facts, and answers to questions',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query extracted from the user\'s question. Should be clear and specific.'
          },
          num_results: {
            type: 'number',
            description: 'Number of search results to return (default: 5, max: 10)'
          }
        },
        required: ['query']
      }
    };

    this.toolDefinitions = [googleSearchTool];
    
    // Note: The actual tool definitions will be sent to Gemini API in the setup message
    // This is handled by the enhanced createSetupMessage method
    logger.info('Tool definitions configured', { 
      toolCount: this.toolDefinitions.length,
      tools: this.toolDefinitions.map(t => t.name)
    });
  }

  /**
   * Setup WebSocket client event handlers
   */
  private setupWebSocketEvents(): void {
    this.websocketClient.on('connected', () => {
      logger.info('Enhanced Gemini Live integration connected');
      this.emit('connected');
    });

    this.websocketClient.on('disconnected', () => {
      logger.info('Enhanced Gemini Live integration disconnected');
      this.emit('disconnected');
    });

    this.websocketClient.on('message', this.handleWebSocketMessage.bind(this));
    this.websocketClient.on('error', this.handleWebSocketError.bind(this));
    this.websocketClient.on('transcription', this.handleTranscription.bind(this));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleWebSocketMessage(message: ParsedGeminiResponse): Promise<void> {
    try {
      // Handle tool call requests from Gemini
      if (message.type === 'tool_call' && message.toolCall) {
        await this.handleIncomingToolCall({
          id: message.toolCall.id || this.generateToolCallId(),
          name: message.toolCall.name,
          parameters: message.toolCall.parameters || {},
          timestamp: Date.now()
        });
        return;
      }

      // Handle regular text responses
      if (message.type === 'text' && message.content) {
        this.addToConversationHistory({
          id: this.generateTurnId(),
          type: 'model',
          content: message.content,
          timestamp: Date.now()
        });

        this.emit('response', {
          text: message.content,
          timestamp: Date.now(),
          source: 'gemini'
        });
      }

      // Handle audio responses
      if (message.type === 'audio' && message.audioData) {
        this.emit('audioResponse', {
          audioData: message.audioData,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error('Error handling WebSocket message', { 
        error: error instanceof Error ? error.message : String(error),
        messageType: message.type 
      });
    }
  }

  /**
   * Handle incoming tool call requests from Gemini
   */
  private async handleIncomingToolCall(toolCall: ToolCallRequest): Promise<void> {
    if (!this.config.toolCalling?.enabled || !this.toolCallHandler) {
      logger.warn('Tool calling disabled or handler not available', { toolCall: toolCall.name });
      return;
    }

    if (this.isProcessingToolCall && !this.config.toolCalling.autoExecute) {
      logger.warn('Tool call already in progress', { pendingCall: toolCall.name });
      return;
    }

    logger.info('Processing tool call from Gemini', { 
      toolName: toolCall.name,
      parameters: toolCall.parameters 
    });

    this.pendingToolCalls.set(toolCall.id, toolCall);
    
    if (this.config.toolCalling.autoExecute) {
      await this.executeToolCall(toolCall);
    } else {
      this.emit('toolCallRequest', toolCall);
    }
  }

  /**
   * Execute a tool call
   */
  private async executeToolCall(toolCall: ToolCallRequest): Promise<ToolCallResult> {
    this.isProcessingToolCall = true;
    const startTime = Date.now();

    try {
      logger.info('Executing tool call', { toolName: toolCall.name });

      let result: any;
      let success = true;
      let error: string | undefined;

      switch (toolCall.name) {
        case 'google_search':
          if (!this.toolCallHandler) {
            throw new Error('Tool call handler not initialized');
          }
          
          const query = toolCall.parameters.query as string;
          const numResults = (toolCall.parameters.num_results as number) || 5;
          
          const searchResult = await this.toolCallHandler.executeGoogleSearch(query, {
            num: numResults,
            safe: 'active'
          });
          
          if (searchResult.success) {
            result = {
              query,
              results: searchResult.results?.slice(0, numResults) || [],
              metadata: searchResult.metadata
            };
          } else {
            success = false;
            error = searchResult.error || 'Google search failed';
            result = { query, results: [] };
          }
          break;

        default:
          success = false;
          error = `Unknown tool: ${toolCall.name}`;
          result = null;
      }

      const toolResult: ToolCallResult = {
        id: toolCall.id,
        name: toolCall.name,
        success,
        result,
        error,
        timestamp: Date.now(),
        executionTime: Date.now() - startTime
      };

      // Send tool result back to Gemini
      await this.sendToolCallResponse(toolResult);

      // Update conversation history
      this.updateConversationWithToolCall(toolCall, toolResult);

      // Clean up pending call
      this.pendingToolCalls.delete(toolCall.id);

      this.emit('toolCallComplete', toolResult);
      
      logger.info('Tool call executed successfully', { 
        toolName: toolCall.name,
        executionTime: toolResult.executionTime,
        success 
      });

      return toolResult;

    } catch (error) {
      const toolResult: ToolCallResult = {
        id: toolCall.id,
        name: toolCall.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        executionTime: Date.now() - startTime
      };

      await this.sendToolCallResponse(toolResult);
      this.pendingToolCalls.delete(toolCall.id);

      logger.error('Tool call execution failed', { 
        toolName: toolCall.name,
        error: toolResult.error 
      });

      this.emit('toolCallError', toolResult);
      return toolResult;

    } finally {
      this.isProcessingToolCall = false;
    }
  }

  /**
   * Send tool call response back to Gemini API
   */
  private async sendToolCallResponse(toolResult: ToolCallResult): Promise<void> {
    try {
      // Format tool call response for Gemini Live API
      const responseData = {
        toolResponse: {
          id: toolResult.id,
          name: toolResult.name,
          result: toolResult.success ? JSON.stringify(toolResult.result) : null,
          error: toolResult.error || null
        }
      };

      // Send as realtime input to continue the conversation
      await this.websocketClient.sendRealtimeInput(responseData as any);
      
      logger.info('Tool call response sent to Gemini', { 
        toolId: toolResult.id,
        success: toolResult.success 
      });

    } catch (error) {
      logger.error('Failed to send tool call response', { 
        error: error instanceof Error ? error.message : String(error),
        toolId: toolResult.id 
      });
    }
  }

  /**
   * Handle transcription input and question detection
   */
  private async handleTranscription(transcription: { text: string, confidence: number }): Promise<void> {
    try {
      const { text, confidence } = transcription;

      // Add to conversation history
      const turn: EnhancedConversationTurn = {
        id: this.generateTurnId(),
        type: 'user',
        content: text,
        timestamp: Date.now(),
        metadata: {
          confidence,
          source: 'transcription'
        }
      };

      // Detect if this is a question that might benefit from tool calling
      if (this.questionDetector && this.config.questionDetection?.enabled) {
        const questionResult = await this.questionDetector.detectQuestion(text);
        
        if (questionResult.isQuestion && questionResult.confidence >= (this.config.questionDetection.minConfidence || 0.7)) {
          turn.metadata = {
            ...turn.metadata,
            questionType: questionResult.questionType
          };

          logger.info('Question detected in transcription', { 
            text: text.substring(0, 100) + '...',
            questionType: questionResult.questionType,
            confidence: questionResult.confidence 
          });
        }
      }

      this.addToConversationHistory(turn);
      this.emit('transcription', transcription);

    } catch (error) {
      logger.error('Error handling transcription', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Handle WebSocket errors
   */
  private handleWebSocketError(error: any): void {
    logger.error('Enhanced Gemini Live integration error', { error });
    this.emit('error', error);
  }

  /**
   * Update conversation history with tool call information
   */
  private updateConversationWithToolCall(toolCall: ToolCallRequest, toolResult: ToolCallResult): void {
    // Find the most recent model turn and add tool call info
    const lastTurn = this.conversationHistory[this.conversationHistory.length - 1];
    
    if (lastTurn && lastTurn.type === 'model') {
      if (!lastTurn.toolCalls) lastTurn.toolCalls = [];
      if (!lastTurn.toolResults) lastTurn.toolResults = [];
      
      lastTurn.toolCalls.push(toolCall);
      lastTurn.toolResults.push(toolResult);
    }
  }

  /**
   * Add turn to conversation history
   */
  private addToConversationHistory(turn: EnhancedConversationTurn): void {
    this.conversationHistory.push(turn);
    
    // Keep history limited to prevent memory bloat
    const maxHistory = 50; // Configurable
    if (this.conversationHistory.length > maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-maxHistory);
    }
  }

  /**
   * Generate unique tool call ID
   */
  private generateToolCallId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique turn ID
   */
  private generateTurnId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods

  /**
   * Connect to Gemini Live API
   */
  async connect(): Promise<void> {
    await this.websocketClient.connect();
  }

  /**
   * Disconnect from Gemini Live API
   */
  async disconnect(): Promise<void> {
    await this.websocketClient.disconnect();
  }

  /**
   * Send audio input to Gemini Live API
   */
  async sendAudio(audioData: string, mimeType = 'audio/pcm'): Promise<void> {
    await this.websocketClient.sendRealtimeInput({
      audio: { data: audioData, mimeType }
    });
  }

  /**
   * Send text input to Gemini Live API
   */
  async sendText(text: string): Promise<void> {
    await this.websocketClient.sendRealtimeInput({ text });
    
    // Add to conversation history
    this.addToConversationHistory({
      id: this.generateTurnId(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
      metadata: { source: 'text_input' }
    });
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): EnhancedConversationTurn[] {
    return [...this.conversationHistory];
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.websocketClient.getConnectionState();
  }

  /**
   * Get pending tool calls
   */
  getPendingToolCalls(): ToolCallRequest[] {
    return Array.from(this.pendingToolCalls.values());
  }

  /**
   * Manually execute a pending tool call
   */
  async executePendingToolCall(toolCallId: string): Promise<ToolCallResult | null> {
    const toolCall = this.pendingToolCalls.get(toolCallId);
    if (!toolCall) {
      logger.warn('Tool call not found', { toolCallId });
      return null;
    }

    return this.executeToolCall(toolCall);
  }

  /**
   * Get tool call statistics
   */
  getToolCallStats(): { successful: number; failed: number; pending: number } {
    const successful = this.conversationHistory
      .flatMap(turn => turn.toolResults || [])
      .filter(result => result.success).length;
      
    const failed = this.conversationHistory
      .flatMap(turn => turn.toolResults || [])
      .filter(result => !result.success).length;
      
    const pending = this.pendingToolCalls.size;

    return { successful, failed, pending };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.websocketClient) {
      this.websocketClient.disconnect();
    }
    
    if (this.toolCallHandler) {
      this.toolCallHandler.destroy();
    }

    this.removeAllListeners();
    this.conversationHistory = [];
    this.pendingToolCalls.clear();
  }
}

export default EnhancedGeminiLiveIntegration;