/**
 * Gemini Tool Call Bridge - Integration Layer
 *
 * This service bridges the gap between Gemini Live WebSocket tool calls
 * and the existing search tools, ensuring tool call results are properly
 * executed and displayed in the chat interface.
 */

import {EventEmitter} from 'events'
import GeminiLiveWebSocketClient from './gemini-live-websocket'
import {GeminiSearchTools} from './gemini-search-tools'
import {ToolCallResult} from './tool-call-handler'

export interface ToolCallRequest {
  id: string
  name: string
  parameters: Record<string, unknown>
  timestamp: number
}

export interface ToolCallResponse {
  id: string
  name: string
  result: ToolCallResult
  success: boolean
  error?: string
  timestamp: number
  executionTime: number
}

export interface BridgeConfig {
  enableFunctionCalling: boolean
  maxConcurrentCalls: number
  callTimeout: number
  enableResultDisplay: boolean
  enableDebugLogging: boolean
}

/**
 * Gemini Tool Call Bridge - Handles function calls from Gemini Live
 */
export class GeminiToolCallBridge extends EventEmitter {
  private geminiClient: GeminiLiveWebSocketClient
  private searchTools: GeminiSearchTools
  private config: BridgeConfig
  private activeCalls: Map<string, ToolCallRequest> = new Map()
  private isInitialized = false

  constructor(
    geminiClient: GeminiLiveWebSocketClient,
    searchTools: GeminiSearchTools,
    config: Partial<BridgeConfig> = {}
  ) {
    super()

    this.geminiClient = geminiClient
    this.searchTools = searchTools
    this.config = {
      enableFunctionCalling: true,
      maxConcurrentCalls: 5,
      callTimeout: 30000, // 30 seconds
      enableResultDisplay: true,
      enableDebugLogging: false,
      ...config
    }

    this.initialize()
  }

  private initialize(): void {
    if (this.isInitialized) return

    // Listen for tool calls from Gemini Live WebSocket
    this.geminiClient.on('toolCall', this.handleToolCall.bind(this))

    // Listen for WebSocket reconnection to clear active calls
    this.geminiClient.on('connectionStateChanged', state => {
      if (state === 'connected') {
        this.activeCalls.clear()
      }
    })

    this.isInitialized = true
    this.log('Gemini Tool Call Bridge initialized')
  }

  /**
   * Handle tool call from Gemini Live WebSocket
   */
  private async handleToolCall(toolCall: {
    name: string
    parameters: Record<string, unknown>
    id: string
  }): Promise<void> {
    if (!this.config.enableFunctionCalling) {
      this.log('Function calling is disabled', 'warn')
      return
    }

    const request: ToolCallRequest = {
      id: toolCall.id,
      name: toolCall.name,
      parameters: toolCall.parameters,
      timestamp: Date.now()
    }

    this.log(`Received tool call: ${toolCall.name} (${toolCall.id})`)

    // Check if we're already handling too many calls
    if (this.activeCalls.size >= this.config.maxConcurrentCalls) {
      this.log(
        `Too many concurrent calls (${this.activeCalls.size}), rejecting call ${toolCall.id}`,
        'warn'
      )
      await this.sendToolCallError(request, 'Too many concurrent tool calls')
      return
    }

    // Track the active call
    this.activeCalls.set(request.id, request)

    // Emit event for UI updates
    this.emit('toolCallStarted', request)

    try {
      // Execute the tool call with timeout
      const executionPromise = this.executeToolCall(request)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tool call timeout')), this.config.callTimeout)
      })

      const result = await Promise.race([executionPromise, timeoutPromise])

      await this.sendToolCallResponse(request, result)
    } catch (error) {
      this.log(`Tool call ${request.id} failed: ${error}`, 'error')
      await this.sendToolCallError(
        request,
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      this.activeCalls.delete(request.id)
    }
  }

  /**
   * Execute the actual tool call based on the function name
   */
  private async executeToolCall(request: ToolCallRequest): Promise<ToolCallResult> {
    const startTime = performance.now()

    switch (request.name) {
      case 'google_search':
        return await this.searchTools.google_search(request.parameters as any)

      case 'fetch_page':
        return await this.searchTools.fetch_page(request.parameters as any)

      case 'summarize_results':
        return await this.searchTools.summarize_results(request.parameters as any)

      default:
        throw new Error(`Unknown tool call: ${request.name}`)
    }
  }

  /**
   * Send successful tool call response back to Gemini Live
   */
  private async sendToolCallResponse(
    request: ToolCallRequest,
    result: ToolCallResult
  ): Promise<void> {
    const executionTime = Date.now() - request.timestamp

    const response: ToolCallResponse = {
      id: request.id,
      name: request.name,
      result,
      success: true,
      timestamp: Date.now(),
      executionTime
    }

    this.log(`Tool call ${request.id} completed in ${executionTime}ms`)

    try {
      // Send the response back to Gemini Live WebSocket
      await this.geminiClient.sendRealtimeInput({
        type: 'functionCallResponse',
        functionCallResponse: {
          id: request.id,
          response: result
        }
      })

      // Emit event for UI to display results
      this.emit('toolCallCompleted', response)
    } catch (error) {
      this.log(`Failed to send tool call response for ${request.id}: ${error}`, 'error')
      this.emit('toolCallError', {
        ...response,
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send response'
      })
    }
  }

  /**
   * Send tool call error back to Gemini Live
   */
  private async sendToolCallError(request: ToolCallRequest, errorMessage: string): Promise<void> {
    const executionTime = Date.now() - request.timestamp

    const response: ToolCallResponse = {
      id: request.id,
      name: request.name,
      result: {
        success: false,
        error: errorMessage,
        metadata: {
          query: '',
          timestamp: Date.now(),
          responseTime: executionTime,
          cacheHit: false,
          quotaUsed: 0,
          source: 'fallback'
        }
      },
      success: false,
      error: errorMessage,
      timestamp: Date.now(),
      executionTime
    }

    try {
      await this.geminiClient.sendRealtimeInput({
        type: 'functionCallResponse',
        functionCallResponse: {
          id: request.id,
          error: errorMessage
        }
      })

      this.emit('toolCallError', response)
    } catch (error) {
      this.log(`Failed to send tool call error for ${request.id}: ${error}`, 'error')
    }
  }

  /**
   * Get currently active tool calls
   */
  getActiveCalls(): ToolCallRequest[] {
    return Array.from(this.activeCalls.values())
  }

  /**
   * Check if bridge is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.geminiClient.getConnectionState() === 'connected'
  }

  /**
   * Enable or disable function calling
   */
  setFunctionCallingEnabled(enabled: boolean): void {
    this.config.enableFunctionCalling = enabled
    this.log(`Function calling ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.activeCalls.clear()
    this.removeAllListeners()
    this.isInitialized = false
  }

  /**
   * Internal logging with optional levels
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.enableDebugLogging && level === 'info') return

    const prefix = `[GeminiToolCallBridge]`
    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${message}`)
        break
      case 'error':
        console.error(`${prefix} ${message}`)
        break
      default:
        console.log(`${prefix} ${message}`)
    }
  }
}

/**
 * Factory function to create configured bridge
 */
export function createGeminiToolCallBridge(
  geminiClient: GeminiLiveWebSocketClient,
  searchTools: GeminiSearchTools,
  config: Partial<BridgeConfig> = {}
): GeminiToolCallBridge {
  return new GeminiToolCallBridge(geminiClient, searchTools, config)
}
