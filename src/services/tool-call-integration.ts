/**
 * Tool Call Integration Service
 *
 * Bridges Gemini Live WebSocket tool calls with actual tool execution
 * and ensures results are displayed in the chat interface
 */

import {EventEmitter} from 'events'
import {GeminiLiveWebSocketClient} from './gemini-live-websocket'
import {
  searchGoogle,
  searchWikipedia,
  searchArxiv,
  searchGitHub,
  searchStackOverflow,
  searchReddit,
  searchYouTube,
  searchNews
} from './gemini-search-tools'
import {logger} from './gemini-logger'

export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
}

export interface ToolCallResult {
  id: string
  name: string
  parameters: Record<string, unknown>
  result: unknown
  success: boolean
  error?: string
  executionTime: number
}

export interface ToolCallIntegrationConfig {
  enabledTools: string[]
  timeout: number
  retryAttempts: number
  enableLogging: boolean
}

export class ToolCallIntegration extends EventEmitter {
  private websocketClient: GeminiLiveWebSocketClient
  private config: ToolCallIntegrationConfig
  private executingCalls: Map<string, Promise<ToolCallResult>> = new Map()

  // Available tool functions mapping
  private readonly toolFunctions: Record<
    string,
    (params: Record<string, unknown>) => Promise<unknown> | unknown
  > = {
    search_google: searchGoogle,
    search_wikipedia: searchWikipedia,
    search_arxiv: searchArxiv,
    search_github: searchGitHub,
    search_stackoverflow: searchStackOverflow,
    search_reddit: searchReddit,
    search_youtube: searchYouTube,
    search_news: searchNews
  }

  constructor(
    websocketClient: GeminiLiveWebSocketClient,
    config: Partial<ToolCallIntegrationConfig> = {}
  ) {
    super()

    this.websocketClient = websocketClient
    this.config = {
      enabledTools: [
        'search_google',
        'search_wikipedia',
        'search_arxiv',
        'search_github',
        'search_stackoverflow',
        'search_reddit',
        'search_youtube',
        'search_news'
      ],
      timeout: 30000, // 30 seconds
      retryAttempts: 2,
      enableLogging: true,
      ...config
    }

    this.setupWebSocketListeners()
  }

  private setupWebSocketListeners(): void {
    // Listen for tool calls from Gemini Live
    this.websocketClient.on('toolCall', (toolCall: ToolCall) => {
      this.handleToolCall(toolCall).catch(error => {
        logger.error('Error handling tool call:', error)
      })
    })

    // Listen for tool call cancellations
    this.websocketClient.on('toolCallCancellation', (data: {toolCallIds: string[]}) => {
      this.handleToolCallCancellation(data.toolCallIds)
    })
  }

  private async handleToolCall(toolCall: ToolCall): Promise<void> {
    if (this.config.enableLogging) {
      logger.info('Executing tool call:', {
        id: toolCall.id,
        name: toolCall.name,
        parameters: toolCall.parameters
      })
    }

    // Check if tool is enabled
    if (!this.config.enabledTools.includes(toolCall.name)) {
      const error = `Tool '${toolCall.name}' is not enabled`
      await this.sendToolCallError(toolCall, error)
      return
    }

    // Check if tool function exists
    const toolFunction = this.toolFunctions[toolCall.name]
    if (!toolFunction) {
      const error = `Tool function '${toolCall.name}' not found`
      await this.sendToolCallError(toolCall, error)
      return
    }

    // Execute tool call with timeout and retry logic
    const executionPromise = this.executeToolWithRetry(toolCall, toolFunction)
    this.executingCalls.set(toolCall.id, executionPromise)

    try {
      const result = await executionPromise

      // Send result back to Gemini Live
      await this.sendToolCallResult(result)

      // Emit result for UI components to display
      this.emit('toolCallResult', result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.sendToolCallError(toolCall, errorMessage)
    } finally {
      this.executingCalls.delete(toolCall.id)
    }
  }

  private async executeToolWithRetry(
    toolCall: ToolCall,
    toolFunction: (params: Record<string, unknown>) => Promise<unknown> | unknown
  ): Promise<ToolCallResult> {
    const startTime = performance.now()
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tool call timeout after ${this.config.timeout}ms`))
          }, this.config.timeout)
        })

        // Execute tool function with timeout
        const resultPromise = Promise.resolve(toolFunction(toolCall.parameters))
        const result = await Promise.race([resultPromise, timeoutPromise])

        const executionTime = performance.now() - startTime

        return {
          id: toolCall.id,
          name: toolCall.name,
          parameters: toolCall.parameters,
          result,
          success: true,
          executionTime
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < this.config.retryAttempts) {
          if (this.config.enableLogging) {
            logger.warn(`Tool call attempt ${attempt + 1} failed, retrying:`, {
              id: toolCall.id,
              error: lastError.message
            })
          }

          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
        }
      }
    }

    const executionTime = performance.now() - startTime
    return {
      id: toolCall.id,
      name: toolCall.name,
      parameters: toolCall.parameters,
      result: null,
      success: false,
      error: lastError?.message || 'Unknown error',
      executionTime
    }
  }

  private async sendToolCallResult(result: ToolCallResult): Promise<void> {
    try {
      // Send tool call response back to Gemini Live API
      await this.websocketClient.sendRealtimeInput({
        text: JSON.stringify({
          tool_call_response: {
            id: result.id,
            function_response: {
              name: result.name,
              content: JSON.stringify(result.result)
            }
          }
        })
      })

      if (this.config.enableLogging) {
        logger.info('Tool call result sent to Gemini Live:', {
          id: result.id,
          success: result.success,
          executionTime: result.executionTime
        })
      }
    } catch (error) {
      logger.error('Failed to send tool call result:', error)
      throw error
    }
  }

  private async sendToolCallError(toolCall: ToolCall, errorMessage: string): Promise<void> {
    const result: ToolCallResult = {
      id: toolCall.id,
      name: toolCall.name,
      parameters: toolCall.parameters,
      result: null,
      success: false,
      error: errorMessage,
      executionTime: 0
    }

    try {
      await this.websocketClient.sendRealtimeInput({
        text: JSON.stringify({
          tool_call_response: {
            id: toolCall.id,
            function_response: {
              name: toolCall.name,
              content: JSON.stringify({
                error: errorMessage,
                success: false
              })
            }
          }
        })
      })

      // Also emit error for UI display
      this.emit('toolCallResult', result)
    } catch (error) {
      logger.error('Failed to send tool call error:', error)
    }
  }

  private handleToolCallCancellation(toolCallIds: string[]): void {
    if (this.config.enableLogging) {
      logger.info('Cancelling tool calls:', {toolCallIds})
    }

    // Cancel any ongoing tool executions
    for (const id of toolCallIds) {
      if (this.executingCalls.has(id)) {
        // Note: We can't actually cancel the Promise, but we can ignore the result
        this.executingCalls.delete(id)
      }
    }

    // Emit cancellation event for UI
    this.emit('toolCallCancellation', {toolCallIds})
  }

  public isExecuting(toolCallId: string): boolean {
    return this.executingCalls.has(toolCallId)
  }

  public getExecutingCalls(): string[] {
    return Array.from(this.executingCalls.keys())
  }

  public updateConfig(newConfig: Partial<ToolCallIntegrationConfig>): void {
    this.config = {...this.config, ...newConfig}
  }

  public getConfig(): ToolCallIntegrationConfig {
    return {...this.config}
  }

  public destroy(): void {
    this.executingCalls.clear()
    this.removeAllListeners()
  }
}

// Factory function to create and initialize tool call integration
export function createToolCallIntegration(
  websocketClient: GeminiLiveWebSocketClient,
  config?: Partial<ToolCallIntegrationConfig>
): ToolCallIntegration {
  return new ToolCallIntegration(websocketClient, config)
}
