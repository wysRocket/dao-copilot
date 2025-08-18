/**
 * HTTP Stream Transport Implementation
 *
 * Mid-tier fallback transport using HTTP streaming for persistent connections
 * when WebSocket connections fail due to schema incompatibility or network issues.
 */

import {TransportStrategy, AudioSendOptions, TranscriptionResult} from '../FallbackManager'
import {logger} from '../../services/gemini-logger'
import {EventEmitter} from 'events'

export interface HttpStreamTransportConfig {
  baseUrl: string
  timeout: number
  maxRetries: number
  retryDelayMs: number
  chunkSize: number
  connectionPoolSize: number
}

export interface HttpStreamTransportMetrics {
  requestCount: number
  successfulRequests: number
  failedRequests: number
  averageLatency: number
  bytesTransmitted: number
  bytesReceived: number
  connectionPoolUtilization: number
}

const DEFAULT_CONFIG: HttpStreamTransportConfig = {
  baseUrl:
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
  timeout: 30000,
  maxRetries: 3,
  retryDelayMs: 2000,
  chunkSize: 64 * 1024, // 64KB chunks
  connectionPoolSize: 5
}

/**
 * HTTP Stream transport for fallback connectivity
 */
export class HttpStreamTransport extends EventEmitter implements TransportStrategy {
  readonly name: string = 'http-stream'
  readonly priority: number = 2 // Medium priority transport

  private config: HttpStreamTransportConfig
  private abortController: AbortController | null = null
  private isConnected: boolean = false
  private isHealthy: boolean = false
  private metrics: HttpStreamTransportMetrics
  private currentSessionId: string | null = null

  constructor(config: Partial<HttpStreamTransportConfig> = {}) {
    super()
    this.config = {...DEFAULT_CONFIG, ...config}
    this.metrics = this.initializeMetrics()
  }

  private initializeMetrics(): HttpStreamTransportMetrics {
    return {
      requestCount: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      bytesTransmitted: 0,
      bytesReceived: 0,
      connectionPoolUtilization: 0
    }
  }

  /**
   * Check if transport is available
   */
  isAvailable(): boolean {
    return typeof fetch !== 'undefined' // Available if fetch API is supported
  }

  /**
   * Initialize HTTP Stream transport
   */
  async initialize(): Promise<void> {
    logger.info('HttpStreamTransport: Initializing HTTP stream transport')

    try {
      // Test connectivity with a simple request
      await this.testConnectivity()
      this.isConnected = true
      this.isHealthy = true
      this.emit('connected')
    } catch (error) {
      logger.error('HttpStreamTransport: Failed to initialize:', {error: String(error)})
      throw error
    }
  }

  /**
   * Test connectivity to the HTTP endpoint
   */
  private async testConnectivity(): Promise<void> {
    const startTime = Date.now()

    try {
      const response = await fetch(this.config.baseUrl, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(this.config.timeout)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const latency = Date.now() - startTime
      this.metrics.averageLatency = latency
      logger.info(`HttpStreamTransport: Connectivity test passed (${latency}ms)`)
    } catch (error) {
      logger.error('HttpStreamTransport: Connectivity test failed:', {error: String(error)})
      throw error
    }
  }

  /**
   * Send audio data through HTTP streaming
   */
  async sendAudio(audioData: Buffer, options?: AudioSendOptions): Promise<TranscriptionResult> {
    if (!this.isHealthy) {
      throw new Error('HTTP Stream transport is not healthy')
    }

    const startTime = Date.now()
    this.metrics.requestCount++

    try {
      // Create streaming request payload
      const requestPayload = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: options?.mimeType || 'audio/pcm',
                  data: audioData.toString('base64')
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          candidateCount: 1
        },
        safetySettings: []
      }

      // Setup abort controller for this request
      this.abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        this.abortController?.abort()
      }, this.config.timeout)

      // Send HTTP streaming request
      const response = await fetch(`${this.config.baseUrl}?key=${process.env.GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GOOGLE_API_KEY}`
        },
        body: JSON.stringify(requestPayload),
        signal: this.abortController.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Process streaming response
      const result = await this.processStreamingResponse(response)

      this.metrics.successfulRequests++
      this.metrics.bytesTransmitted += JSON.stringify(requestPayload).length

      const latency = Date.now() - startTime
      this.updateAverageLatency(latency)

      return {
        text: result.text,
        confidence: result.confidence,
        source: 'http-stream' as const,
        sessionId: options?.sessionId || this.currentSessionId || undefined
      }
    } catch (error) {
      this.metrics.failedRequests++
      logger.error('HttpStreamTransport: Failed to send audio:', {error: String(error)})

      // Check if this is a recoverable error
      if (this.isRecoverableError(error)) {
        this.isHealthy = false
        this.emit('healthChange', {isHealthy: false, quality: 0.3})
      }

      throw error
    }
  }

  /**
   * Process streaming HTTP response
   */
  private async processStreamingResponse(
    response: Response
  ): Promise<{text: string; confidence?: number}> {
    if (!response.body) {
      throw new Error('No response body received')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let accumulatedText = ''
    let confidence: number | undefined

    try {
      while (true) {
        const {done, value} = await reader.read()

        if (done) {
          break
        }

        const chunk = decoder.decode(value, {stream: true})
        this.metrics.bytesReceived += chunk.length

        // Process each line in the chunk (streaming JSON responses are line-delimited)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line)

            // Extract text content from Gemini API response
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const parts = data.candidates[0].content.parts || []
              for (const part of parts) {
                if (part.text) {
                  accumulatedText += part.text
                }
              }

              // Extract confidence if available
              if (data.candidates[0].finishReason && !confidence) {
                confidence = 0.8 // Default confidence for HTTP stream
              }
            }
          } catch (parseError) {
            logger.warn('HttpStreamTransport: Failed to parse stream chunk:', {
              parseError: String(parseError),
              line
            })
          }
        }
      }

      return {
        text: accumulatedText,
        confidence
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Send turn completion signal
   */
  async sendTurnComplete(): Promise<void> {
    // For HTTP streaming, we don't need explicit turn completion
    // The request completes when the stream ends
    logger.info('HttpStreamTransport: Turn completion handled by request completion')
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network errors are generally recoverable
      if (error.name === 'TypeError' || error.name === 'AbortError') {
        return true
      }

      // HTTP 5xx errors are recoverable
      if (error.message.includes('HTTP 5')) {
        return true
      }
    }

    return false
  }

  /**
   * Update average latency metric
   */
  private updateAverageLatency(newLatency: number): void {
    const totalRequests = this.metrics.successfulRequests
    if (totalRequests === 1) {
      this.metrics.averageLatency = newLatency
    } else {
      this.metrics.averageLatency =
        (this.metrics.averageLatency * (totalRequests - 1) + newLatency) / totalRequests
    }
  }

  /**
   * Disconnect HTTP Stream transport
   */
  async disconnect(): Promise<void> {
    logger.info('HttpStreamTransport: Disconnecting')

    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    this.isConnected = false
    this.isHealthy = false
    this.emit('disconnected', {code: 0, reason: 'Manual disconnect'})
  }

  /**
   * Check if transport is healthy
   */
  isTransportHealthy(): boolean {
    return this.isHealthy && this.isConnected
  }

  /**
   * Get transport quality score (0.0 to 1.0)
   */
  getQualityScore(): number {
    if (!this.isConnected) {
      return 0.0
    }

    if (!this.isHealthy) {
      return 0.3
    }

    // Calculate quality based on success rate
    const successRate =
      this.metrics.requestCount > 0
        ? this.metrics.successfulRequests / this.metrics.requestCount
        : 0

    // HTTP streaming is inherently less efficient than WebSocket, so cap at 0.8
    return Math.max(0.3, Math.min(0.8, successRate))
  }

  /**
   * Get transport metrics
   */
  getMetrics(): HttpStreamTransportMetrics {
    return {...this.metrics}
  }

  /**
   * Reset transport state
   */
  async reset(): Promise<void> {
    logger.info('HttpStreamTransport: Resetting transport state')

    await this.disconnect()

    // Reset metrics but preserve some for analysis
    this.currentSessionId = null
  }

  /**
   * Destroy transport and clean up resources
   */
  async destroy(): Promise<void> {
    logger.info('HttpStreamTransport: Destroying transport')
    await this.disconnect()
    this.removeAllListeners()
  }

  /**
   * Get transport type identifier
   */
  getTransportType(): string {
    return 'http-stream'
  }
}

export default HttpStreamTransport
