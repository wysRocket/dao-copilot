import fetch from 'node-fetch'
import {getProxyAuthToken} from '../helpers/proxy-server'
import {TranscriptionMode} from './gemini-live-integration'
import GeminiLiveWebSocketClient, {
  type GeminiLiveConfig,
  ResponseModality,
  QueuePriority,
  type RealtimeInput
} from './gemini-live-websocket'
import {
  createLegacyWrapper,
  migrateLegacyConfig,
  LegacyAliases,
  migrateToV1Beta
} from './transcription-compatibility'
import {logger} from './gemini-logger'

/**
 * Configuration options for the proxy-based transcription service
 */
export interface ProxyTranscriptionOptions {
  apiKey?: string
  modelName?: string
  proxyUrl?: string
  mode?: TranscriptionMode // Transcription mode: 'websocket', 'batch', or 'hybrid'
  enableWebSocket?: boolean // Feature flag to enable WebSocket functionality
  fallbackToBatch?: boolean // Whether to fallback to batch mode on WebSocket failure
  realTimeThreshold?: number // Minimum audio length for real-time processing (ms)
}

/**
 * Transcription result interface (backward compatible)
 */
export interface ProxyTranscriptionResult {
  text: string
  duration: number
  confidence?: number // Confidence score (when available)
  source?: string // Source of transcription ('websocket-proxy', 'batch-proxy')
  [key: string]: unknown
}

const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash' // Regular model for batch API
const DEFAULT_PROXY_URL = 'http://localhost:8001'

interface GeminiProxyResponse {
  candidates?: {content?: {parts?: {text?: string}[]}}[]
}

/**
 * Alternative transcription service that uses the proxy server
 * This can be used as a fallback if direct API calls have issues
 *
 * @deprecated Use transcribeAudioViaProxyEnhanced for better mode support
 */
export async function transcribeAudioViaProxy(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  // Maintain backward compatibility by using batch mode
  return transcribeAudioViaBatchProxy(audioData, options)
}

/**
 * Check if WebSocket mode should be used for proxy transcription
 */
function shouldUseWebSocketProxy(options: ProxyTranscriptionOptions): boolean {
  // Check feature flag
  const webSocketEnabled = process.env.GEMINI_WEBSOCKET_ENABLED !== 'false'

  // Check explicit option
  if (options.enableWebSocket !== undefined) {
    return options.enableWebSocket && webSocketEnabled
  }

  // Use mode to determine WebSocket usage
  const mode = options.mode || TranscriptionMode.HYBRID
  return (
    webSocketEnabled && (mode === TranscriptionMode.WEBSOCKET || mode === TranscriptionMode.HYBRID)
  )
}

/**
 * WebSocket client instance for proxy transcription
 * Reused across requests to maintain connection efficiency
 */
let webSocketClientInstance: GeminiLiveWebSocketClient | null = null

/**
 * Initialize or get existing WebSocket client for proxy transcription
 */
function getWebSocketClient(options: ProxyTranscriptionOptions): GeminiLiveWebSocketClient {
  if (!webSocketClientInstance || webSocketClientInstance.getConnectionState() === 'disconnected') {
    const config: GeminiLiveConfig = {
      apiKey: options.apiKey || 
        process.env.GOOGLE_API_KEY ||
        process.env.VITE_GOOGLE_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
        process.env.GEMINI_API_KEY || '',
      model: 'gemini-live-2.5-flash-preview', // Use v1beta model
      responseModalities: [ResponseModality.TEXT], // Primary mode for transcription
      systemInstruction: 'You are a speech-to-text transcription service. Provide accurate transcriptions of audio input.',
      reconnectAttempts: 3,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      apiVersion: process.env.GEMINI_API_VERSION || 'v1beta' // Use configured API version or default to v1beta
    }

    if (!config.apiKey) {
      throw new Error('API key is required for WebSocket proxy transcription')
    }

    webSocketClientInstance = new GeminiLiveWebSocketClient(config)
    
    // Set up event handlers for logging
    webSocketClientInstance.on('connected', () => {
      logger.info('WebSocket proxy client connected')
    })
    
    webSocketClientInstance.on('disconnected', () => {
      logger.info('WebSocket proxy client disconnected')
    })
    
    webSocketClientInstance.on('error', (error) => {
      logger.error('WebSocket proxy client error:', error)
    })
  }

  return webSocketClientInstance
}

/**
 * Transcribe audio using WebSocket proxy endpoint with real v1beta WebSocket client
 * This provides actual WebSocket-based real-time transcription through proxy
 */
async function transcribeAudioViaWebSocketProxy(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  const startTime = Date.now()

  logger.debug('Starting WebSocket proxy transcription', {
    audioSize: audioData.length,
    mode: 'websocket'
  })

  try {
    const wsClient = getWebSocketClient(options)
    
    // Connect if not already connected and wait for setup completion
    if (wsClient.getConnectionState() !== 'connected') {
      await wsClient.connect()
    }
    
    // CRITICAL: Wait for setup completion before sending audio
    // This ensures the Gemini Live API is ready to receive audio data
    if (!wsClient.isSetupCompleted()) {
      logger.debug('Waiting for WebSocket setup completion before sending audio')
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for WebSocket setup completion'))
        }, 15000)
        
        const onSetupComplete = () => {
          clearTimeout(timeout)
          wsClient.off('setupComplete', onSetupComplete)
          wsClient.off('error', onSetupError)
          logger.debug('WebSocket setup completed - ready to send audio')
          resolve()
        }
        
        const onSetupError = (error: unknown) => {
          clearTimeout(timeout)
          wsClient.off('setupComplete', onSetupComplete) 
          wsClient.off('error', onSetupError)
          reject(error)
        }
        
        // Check if already complete before adding listeners
        if (wsClient.isSetupCompleted()) {
          clearTimeout(timeout)
          resolve()
          return
        }
        
        wsClient.on('setupComplete', onSetupComplete)
        wsClient.on('error', onSetupError)
      })
    }

    // Convert audio buffer to base64 for WebSocket transmission
    const audioBase64 = audioData.toString('base64')
    
    // Create realtime input for audio
    const realtimeInput = {
      audio: {
        data: audioBase64,
        mimeType: 'audio/wav'
      }
    }

    // Promise to handle the transcription response
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('WebSocket proxy transcription timeout'))
      }, 30000) // 30 second timeout

      let responseText = ''
      
      // Listen for text responses
      const handleTextResponse = (response: {content: string; metadata?: {isPartial?: boolean; turnComplete?: boolean; confidence?: number}}) => {
        responseText += response.content
        
        // Check if this is a complete response
        if (response.metadata?.isPartial === false || response.metadata?.turnComplete) {
          clearTimeout(timeoutId)
          wsClient.off('textResponse', handleTextResponse)
          wsClient.off('error', handleError)
          
          const endTime = Date.now()
          const duration = endTime - startTime
          
          logger.debug('WebSocket proxy transcription completed', {
            duration,
            textLength: responseText.length
          })
          
          resolve({
            text: responseText.trim(),
            duration,
            source: 'websocket-proxy',
            confidence: response.metadata?.confidence
          })
        }
      }
      
      const handleError = (error: Error | unknown) => {
        clearTimeout(timeoutId)
        wsClient.off('textResponse', handleTextResponse)
        wsClient.off('error', handleError)
        reject(error)
      }
      
      // Set up event listeners
      wsClient.on('textResponse', handleTextResponse)
      wsClient.on('error', handleError)
      
      // Send the audio data
      wsClient.sendRealtimeInput(realtimeInput, {
        priority: QueuePriority.HIGH,
        timeout: 25000
      }).catch(handleError)
    })

  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    logger.error('WebSocket proxy transcription failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })
    throw error
  }
}

/**
 * Transcribe audio using batch proxy endpoint (traditional HTTP)
 * Enhanced with better logging and v1beta compatibility
 */
async function transcribeAudioViaBatchProxy(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  const startTime = Date.now()

  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Google API Key is required for batch proxy transcription.')
  }

  const modelName = options.modelName || DEFAULT_GEMINI_MODEL
  const proxyUrl = options.proxyUrl || DEFAULT_PROXY_URL

  logger.debug('Starting batch proxy transcription', {
    audioSize: audioData.length,
    model: modelName,
    proxyUrl: proxyUrl.substring(0, 30) + '...'
  })

  // Prepare the request body for Gemini API
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: audioData.toString('base64'),
              mimeType: 'audio/wav'
            }
          },
          {
            text: 'Please transcribe the provided audio.'
          }
        ]
      }
    ]
  }

  try {
    logger.info('Sending batch transcription request via proxy', {
      endpoint: `${proxyUrl}/gemini/models/${modelName}:generateContent`,
      hasApiKey: !!apiKey
    })

    const response = await fetch(
      `${proxyUrl}/gemini/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-proxy-auth': getProxyAuthToken(),
          'x-transcription-mode': 'batch'
        },
        body: JSON.stringify(requestBody)
      }
    )

    const endTime = Date.now()
    const duration = endTime - startTime

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Batch proxy transcription failed', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        duration
      })
      throw new Error(`Batch proxy transcription failed: ${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as GeminiProxyResponse
    const transcribedText = result.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!transcribedText) {
      logger.warn('No transcription text found in batch proxy response', {
        response: JSON.stringify(result, null, 2).substring(0, 500) + '...'
      })
    }

    logger.debug('Batch proxy transcription completed', {
      duration,
      textLength: transcribedText.length,
      hasResponse: !!transcribedText
    })

    return {
      text: transcribedText.trim(),
      duration,
      source: 'batch-proxy',
      rawResponse: result
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    logger.error('Batch proxy transcription failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })
    throw error
  }
}

/**
 * Determine the appropriate audio length for real-time processing
 */
function getAudioLengthMs(audioData: Buffer): number {
  // Estimate audio length based on buffer size
  // For 16-bit PCM at 24kHz (common for transcription), each sample is 2 bytes
  // Length = (buffer size / 2) / sample rate * 1000
  const sampleRate = 24000 // Common rate for transcription
  const bytesPerSample = 2 // 16-bit
  const samples = audioData.length / bytesPerSample
  return (samples / sampleRate) * 1000
}

/**
 * Enhanced proxy transcription service with mode support
 * Supports WebSocket, batch, and hybrid modes with automatic fallback
 */
export async function transcribeAudioViaProxyEnhanced(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  const mode = options.mode || TranscriptionMode.HYBRID
  const enableWebSocket = shouldUseWebSocketProxy(options)
  const fallbackToBatch = options.fallbackToBatch !== false
  const realTimeThreshold = options.realTimeThreshold || 3000 // 3 seconds

  const audioLengthMs = getAudioLengthMs(audioData)
  const isShortAudio = audioLengthMs < realTimeThreshold

  console.log(
    `Proxy transcription mode: ${mode}, audio length: ${audioLengthMs}ms, WebSocket enabled: ${enableWebSocket}`
  )

  try {
    switch (mode) {
      case TranscriptionMode.WEBSOCKET:
        if (enableWebSocket) {
          return await transcribeAudioViaWebSocketProxy(audioData, options)
        } else {
          throw new Error('WebSocket mode requested but not enabled')
        }

      case TranscriptionMode.BATCH:
        return await transcribeAudioViaBatchProxy(audioData, options)

      case TranscriptionMode.HYBRID:
        // For hybrid mode, prefer WebSocket for short audio, batch for long audio
        if (enableWebSocket && isShortAudio) {
          try {
            console.log('Using WebSocket proxy for short audio in hybrid mode')
            return await transcribeAudioViaWebSocketProxy(audioData, options)
          } catch (webSocketError) {
            console.warn(
              'WebSocket proxy failed in hybrid mode, falling back to batch:',
              webSocketError
            )
            if (fallbackToBatch) {
              return await transcribeAudioViaBatchProxy(audioData, options)
            }
            throw webSocketError
          }
        } else {
          console.log('Using batch proxy for long audio in hybrid mode')
          return await transcribeAudioViaBatchProxy(audioData, options)
        }

      default:
        throw new Error(`Unsupported transcription mode: ${mode}`)
    }
  } catch (error) {
    // If WebSocket fails and fallback is enabled, try batch mode
    if (enableWebSocket && fallbackToBatch && mode !== TranscriptionMode.BATCH) {
      console.warn('Primary method failed, attempting batch proxy fallback:', error)
      try {
        return await transcribeAudioViaBatchProxy(audioData, options)
      } catch (fallbackError) {
        console.error('Batch proxy fallback also failed:', fallbackError)
        throw error // Throw original error
      }
    }
    throw error
  }
}

/**
 * Validate proxy transcription configuration
 */
export function validateProxyConfig(options: ProxyTranscriptionOptions = {}): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Check API key availability
  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY

  if (!apiKey) {
    errors.push('Google API Key is required but not found in options or environment variables')
  }

  // Check proxy URL
  const proxyUrl = options.proxyUrl || DEFAULT_PROXY_URL
  try {
    new URL(proxyUrl)
  } catch {
    errors.push(`Invalid proxy URL: ${proxyUrl}`)
  }

  // Check mode validity
  if (options.mode && !Object.values(TranscriptionMode).includes(options.mode)) {
    errors.push(`Invalid transcription mode: ${options.mode}`)
  }

  // Check WebSocket configuration
  if (options.mode === TranscriptionMode.WEBSOCKET && !shouldUseWebSocketProxy(options)) {
    warnings.push('WebSocket mode requested but WebSocket is not enabled')
  }

  // Check threshold values
  if (options.realTimeThreshold !== undefined && options.realTimeThreshold < 0) {
    errors.push('realTimeThreshold must be non-negative')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Get default proxy transcription options with environment-based configuration
 */
export function getDefaultProxyConfig(): ProxyTranscriptionOptions {
  return {
    mode: (process.env.GEMINI_TRANSCRIPTION_MODE as TranscriptionMode) || TranscriptionMode.HYBRID,
    enableWebSocket: process.env.GEMINI_WEBSOCKET_ENABLED !== 'false',
    fallbackToBatch: process.env.GEMINI_FALLBACK_TO_BATCH !== 'false',
    realTimeThreshold: parseInt(process.env.GEMINI_REALTIME_THRESHOLD || '3000', 10),
    proxyUrl: process.env.PROXY_URL || DEFAULT_PROXY_URL,
    modelName: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  }
}

/**
 * Create a configured proxy transcription function with preset options
 */
export function createProxyTranscriber(defaultOptions: ProxyTranscriptionOptions = {}) {
  const config = {...getDefaultProxyConfig(), ...defaultOptions}

  return async (audioData: Buffer, overrideOptions: ProxyTranscriptionOptions = {}) => {
    const finalOptions = {...config, ...overrideOptions}
    return transcribeAudioViaProxyEnhanced(audioData, finalOptions)
  }
}

/**
 * Check proxy server health and WebSocket support
 */
export async function checkProxyHealth(proxyUrl: string = DEFAULT_PROXY_URL): Promise<{
  isHealthy: boolean
  supportsWebSocket: boolean
  latency: number
  error?: string
}> {
  const startTime = Date.now()

  try {
    // Check basic health endpoint
    const healthResponse = await fetch(`${proxyUrl}/health`, {
      method: 'GET',
      headers: {
        'x-proxy-auth': getProxyAuthToken()
      }
    })

    const latency = Date.now() - startTime

    if (!healthResponse.ok) {
      return {
        isHealthy: false,
        supportsWebSocket: false,
        latency,
        error: `Health check failed: ${healthResponse.status}`
      }
    }

    // Check WebSocket support
    let supportsWebSocket = false
    try {
      const wsHealthResponse = await fetch(`${proxyUrl}/gemini/websocket/health`, {
        method: 'GET',
        headers: {
          'x-proxy-auth': getProxyAuthToken()
        }
      })
      supportsWebSocket = wsHealthResponse.ok
    } catch {
      // WebSocket endpoint not available
      supportsWebSocket = false
    }

    return {
      isHealthy: true,
      supportsWebSocket,
      latency
    }
  } catch (error) {
    return {
      isHealthy: false,
      supportsWebSocket: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Environment configuration helper
 */
export const ProxyTranscriptionEnv = {
  // Check if proxy transcription is properly configured
  isConfigured(): boolean {
    const validation = validateProxyConfig()
    return validation.isValid
  },

  // Get configuration status
  getConfigStatus() {
    const validation = validateProxyConfig()
    const config = getDefaultProxyConfig()

    return {
      ...validation,
      config,
      environment: {
        hasApiKey:
          !!process.env.GOOGLE_API_KEY ||
          !!process.env.VITE_GOOGLE_API_KEY ||
          !!process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          !!process.env.GEMINI_API_KEY,
        proxyUrl: process.env.PROXY_URL || DEFAULT_PROXY_URL,
        webSocketEnabled: process.env.GEMINI_WEBSOCKET_ENABLED !== 'false',
        transcriptionMode: process.env.GEMINI_TRANSCRIPTION_MODE || TranscriptionMode.HYBRID
      }
    }
  }
}

// Re-export types and enums for convenience
export {TranscriptionMode} from './gemini-live-integration'

// Legacy compatibility wrapper for backward compatibility
const originalTranscribeAudioViaProxy = transcribeAudioViaProxy as (...args: unknown[]) => unknown
const originalTranscribeAudioViaProxyEnhanced = transcribeAudioViaProxyEnhanced as (
  ...args: unknown[]
) => unknown

/**
 * Legacy-compatible proxy transcription function with automatic option migration
 */
export const transcribeAudioViaProxyLegacy = createLegacyWrapper(
  originalTranscribeAudioViaProxy,
  'transcribeAudioViaProxy'
)

/**
 * Enhanced legacy-compatible proxy transcription function with automatic option migration
 */
export const transcribeAudioViaProxyEnhancedLegacy = createLegacyWrapper(
  originalTranscribeAudioViaProxyEnhanced,
  'transcribeAudioViaProxyEnhanced'
)

/**
 * Enhanced proxy transcription function that automatically detects and migrates legacy options
 * Now includes v1beta migration support
 */
export async function transcribeAudioViaProxyWithCompatibility(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  // Migrate legacy configuration options if needed (cast to compatible type)
  const migrationResult = migrateLegacyConfig(options as Parameters<typeof migrateLegacyConfig>[0], true)

  if (migrationResult.isLegacy) {
    logger.warn('Legacy proxy configuration detected. Consider migrating to the new format.')
    if (migrationResult.deprecations.length > 0) {
      migrationResult.deprecations.forEach(deprecation => {
        logger.warn(`[DEPRECATION] ${deprecation}`)
      })
    }
    if (migrationResult.warnings.length > 0) {
      migrationResult.warnings.forEach(warning => {
        logger.warn(`[WARNING] ${warning}`)
      })
    }
  }

  return transcribeAudioViaProxyEnhanced(
    audioData,
    migrationResult.newConfig as ProxyTranscriptionOptions
  )
}

/**
 * v1beta migration helper for proxy transcription
 */
export async function transcribeAudioViaProxyV1Beta(
  audioData: Buffer,
  legacyOptions: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult & { migrationInfo?: { steps: string[], benefits: string[] } }> {
  const migration = migrateToV1Beta(legacyOptions as Parameters<typeof migrateToV1Beta>[0])
  
  logger.info('Migrating to v1beta proxy transcription', {
    steps: migration.migrationSteps.length,
    benefits: migration.benefits.length
  })

  const result = await transcribeAudioViaProxyEnhanced(
    audioData,
    migration.newConfig as ProxyTranscriptionOptions
  )

  return {
    ...result,
    migrationInfo: {
      steps: migration.migrationSteps,
      benefits: migration.benefits
    }
  }
}

// Export legacy aliases for backward compatibility
export const {
  proxyTranscribeLegacy: legacyProxyTranscribeAlias,
  createLegacyConfig: createLegacyProxyConfig,
  setupLegacyEnvironment: setupLegacyProxyEnvironment
} = LegacyAliases

/**
 * Cleanup utilities for proxy services
 */
class ProxyCleanupManager {
  private static activeConnections = new Set<GeminiLiveWebSocketClient>()
  private static cleanupInProgress = false

  static registerConnection(client: GeminiLiveWebSocketClient): void {
    this.activeConnections.add(client)
  }

  static unregisterConnection(client: GeminiLiveWebSocketClient): void {
    this.activeConnections.delete(client)
  }

  static async cleanupAllConnections(): Promise<void> {
    if (this.cleanupInProgress) {
      logger.info('Cleanup already in progress, skipping')
      return
    }

    this.cleanupInProgress = true
    logger.info(`Starting cleanup of ${this.activeConnections.size} active WebSocket connections`)

    const cleanupPromises = Array.from(this.activeConnections).map(async (client) => {
      try {
        await client.disconnect()
        logger.debug('Successfully cleaned up WebSocket connection')
      } catch (error) {
        logger.warn('Error during WebSocket cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    })

    await Promise.allSettled(cleanupPromises)
    this.activeConnections.clear()
    this.cleanupInProgress = false
    logger.info('Cleanup of all WebSocket connections completed')
  }

  static getActiveConnectionCount(): number {
    return this.activeConnections.size
  }
}

/**
 * Enhanced proxy transcription with connection pooling
 */
export async function transcribeAudioViaWebSocketProxyWithPooling(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  const startTime = Date.now()
  
  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Google API Key is required for WebSocket proxy transcription.')
  }

  const modelName = options.modelName || DEFAULT_GEMINI_MODEL

  logger.debug('Starting WebSocket proxy transcription with pooling', {
    audioSize: audioData.length,
    model: modelName,
    activeConnections: ProxyCleanupManager.getActiveConnectionCount()
  })

  // Create and configure WebSocket client
  const wsConfig: GeminiLiveConfig = {
    apiKey,
    model: modelName,
    responseModalities: [ResponseModality.TEXT],
    systemInstruction: 'You are a professional transcription assistant. Provide accurate, clean transcription of audio content.',
    reconnectAttempts: 3,
    heartbeatInterval: 30000,
    connectionTimeout: 10000
  }

  const wsClient = new GeminiLiveWebSocketClient(wsConfig)
  ProxyCleanupManager.registerConnection(wsClient)

  try {
    // Connect to Gemini Live API via v1beta endpoint
    await wsClient.connect()
    
    logger.info('WebSocket connection established for proxy transcription', {
      model: modelName,
      endpoint: 'v1beta'
    })

    // CRITICAL: Wait for setup completion before sending audio
    // This ensures the Gemini Live API is ready to receive audio data  
    if (!wsClient.isSetupCompleted()) {
      logger.debug('Waiting for WebSocket setup completion before sending audio')
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for WebSocket setup completion'))
        }, 15000)
        
        const onSetupComplete = () => {
          clearTimeout(timeout)
          wsClient.off('setupComplete', onSetupComplete)
          wsClient.off('error', onSetupError)
          logger.debug('WebSocket setup completed - ready to send audio')
          resolve()
        }
        
        const onSetupError = (error: unknown) => {
          clearTimeout(timeout)
          wsClient.off('setupComplete', onSetupComplete) 
          wsClient.off('error', onSetupError)
          reject(error)
        }
        
        // Check if already complete before adding listeners
        if (wsClient.isSetupCompleted()) {
          clearTimeout(timeout)
          resolve()
          return
        }
        
        wsClient.on('setupComplete', onSetupComplete)
        wsClient.on('error', onSetupError)
      })
    }

    // Prepare audio input for transcription
    const realtimeInput: RealtimeInput = {
      audio: {
        data: audioData.toString('base64'),
        mimeType: 'audio/wav'
      }
    }

    // Send audio data for transcription
    await wsClient.sendRealtimeInput(realtimeInput)

    // Wait for transcription response with timeout
    const transcriptionPromise = new Promise<string>((resolve, reject) => {
      let transcribedText = ''
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket proxy transcription timeout after 30 seconds'))
      }, 30000)

      const messageHandler = (message: {
        serverContent?: {
          modelTurn?: {
            parts?: { text?: string }[]
          }
          turnComplete?: boolean
        }
      }) => {
        try {
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.text) {
                transcribedText += part.text
              }
            }
          }

          if (message.serverContent?.turnComplete) {
            clearTimeout(timeout)
            resolve(transcribedText.trim())
          }
        } catch (error) {
          clearTimeout(timeout)
          reject(error)
        }
      }

      wsClient.on('message', messageHandler)
    })

    const result = await transcriptionPromise
    const endTime = Date.now()
    const duration = endTime - startTime

    logger.debug('WebSocket proxy transcription completed', {
      duration,
      textLength: result.length,
      model: modelName
    })

    return {
      text: result,
      duration,
      source: 'websocket-proxy-pooled',
      rawResponse: { transcription: result, model: modelName }
    }

  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    logger.error('WebSocket proxy transcription failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
      model: modelName
    })
    throw error
  } finally {
    // Clean up connection
    try {
      await wsClient.disconnect()
      ProxyCleanupManager.unregisterConnection(wsClient)
      logger.debug('WebSocket connection cleaned up after transcription')
    } catch (cleanupError) {
      logger.warn('Error during WebSocket cleanup', {
        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error'
      })
    }
  }
}

// Export the cleanup manager and utilities for external use
export { ProxyCleanupManager }
