import fetch from 'node-fetch'
import {getProxyAuthToken} from '../helpers/proxy-server'
import {TranscriptionMode} from '../types/gemini-types'
import {
  createLegacyWrapper,
  migrateLegacyConfig,
  LegacyAliases
} from './transcription-compatibility'

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

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20'
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
 * Transcribe audio using WebSocket proxy endpoint
 * This provides a proxy layer for WebSocket-based real-time transcription
 */
async function transcribeAudioViaWebSocketProxy(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  const startTime = Date.now()
  const proxyUrl = options.proxyUrl || DEFAULT_PROXY_URL

  // For WebSocket proxy, we'll use a different endpoint that handles real-time streaming
  const wsProxyEndpoint = `${proxyUrl.replace('http', 'ws')}/gemini/websocket/transcribe`

  console.log(`Attempting WebSocket proxy transcription via: ${wsProxyEndpoint}`)

  try {
    // For now, we'll simulate WebSocket proxy by using a special HTTP endpoint
    // In a real implementation, this would establish a WebSocket connection through the proxy
    const response = await fetch(`${proxyUrl}/gemini/websocket/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-auth': getProxyAuthToken(),
        'x-transcription-mode': 'websocket'
      },
      body: JSON.stringify({
        audio: audioData.toString('base64'),
        mimeType: 'audio/wav',
        options: {
          model: options.modelName || DEFAULT_GEMINI_MODEL,
          realTime: true
        }
      })
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    if (!response.ok) {
      throw new Error(`WebSocket proxy failed: ${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as {text: string; confidence?: number}

    console.log(`WebSocket proxy transcription completed in ${duration} ms`)

    return {
      text: result.text.trim(),
      duration,
      confidence: result.confidence,
      source: 'websocket-proxy'
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    console.error(`WebSocket proxy transcription failed after ${duration} ms:`, error)
    throw error
  }
}

/**
 * Transcribe audio using batch proxy endpoint (traditional HTTP)
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
    console.log(
      `Sending batch transcription request via proxy: ${proxyUrl}/gemini/models/${modelName}:generateContent`
    )

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
      console.error(`Batch proxy transcription failed with status ${response.status}:`, errorText)
      throw new Error(`Batch proxy transcription failed: ${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as GeminiProxyResponse
    const transcribedText = result.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!transcribedText) {
      console.warn(
        'No transcription text found in batch proxy response:',
        JSON.stringify(result, null, 2)
      )
    }

    console.log(`Batch proxy transcription completed in ${duration} ms`)

    return {
      text: transcribedText.trim(),
      duration,
      source: 'batch-proxy',
      rawResponse: result
    }
  } catch (error) {
    const endTime = Date.now()
    const duration = endTime - startTime
    console.error(`Batch proxy transcription failed after ${duration} ms:`, error)
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
 */
export async function transcribeAudioViaProxyWithCompatibility(
  audioData: Buffer,
  options: ProxyTranscriptionOptions = {}
): Promise<ProxyTranscriptionResult> {
  // Migrate legacy configuration options if needed (cast to compatible type)
  const migrationResult = migrateLegacyConfig(options as Parameters<typeof migrateLegacyConfig>[0])

  if (migrationResult.isLegacy) {
    console.warn('Legacy proxy configuration detected. Consider migrating to the new format.')
    if (migrationResult.deprecations.length > 0) {
      migrationResult.deprecations.forEach(deprecation => {
        console.warn(`[DEPRECATION] ${deprecation}`)
      })
    }
  }

  return transcribeAudioViaProxyEnhanced(
    audioData,
    migrationResult.newConfig as ProxyTranscriptionOptions
  )
}

// Export legacy aliases for backward compatibility
export const {
  proxyTranscribeLegacy: legacyProxyTranscribeAlias,
  createLegacyConfig: createLegacyProxyConfig,
  setupLegacyEnvironment: setupLegacyProxyEnvironment
} = LegacyAliases
