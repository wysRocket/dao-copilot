import {GoogleGenAI} from '@google/genai'
import {GeminiLiveIntegrationService, TranscriptionMode} from './gemini-live-integration'
import {GeminiLiveIntegrationFactory} from './gemini-live-integration-factory'
import type {TranscriptionResult as IntegrationTranscriptionResult} from './audio-recording'

// User-specified model name
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20'

/**
 * Configuration options for the transcription service
 */
export interface TranscriptionOptions {
  apiKey?: string // Your Google API Key for Gemini
  modelName?: string // Optional: override the default Gemini model name
  mode?: TranscriptionMode // Transcription mode: 'websocket', 'batch', or 'hybrid'
  enableWebSocket?: boolean // Feature flag to enable WebSocket functionality
  fallbackToBatch?: boolean // Whether to fallback to batch mode on WebSocket failure
  realTimeThreshold?: number // Minimum audio length for real-time processing (ms)
}

/**
 * Transcription result interface (backward compatible)
 */
export interface TranscriptionResult {
  text: string
  duration: number // Duration of the API call in milliseconds
  confidence?: number // Confidence score (when available)
  source?: string // Source of transcription ('websocket', 'batch', 'proxy')
  [key: string]: unknown
}

// Helper function to convert Buffer to a GenerativePart
function bufferToGenerativePart(buffer: Buffer, mimeType: string) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType
    }
  }
}

/**
 * Transcribes audio data using Google's Gemini API
 * This version is designed for the main process in Electron
 * @param audioData The audio data as a Buffer (e.g., from a WAV file)
 * @param options Configuration options including the API key and optional model name
 * @returns Promise resolving to the transcription result
 */
export async function transcribeAudio(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now()

  // Check if WebSocket mode should be used
  if (shouldUseWebSocket(options)) {
    try {
      // Use integration service for WebSocket or hybrid mode
      const service = getIntegrationService(options)
      
      // Convert Buffer to Float32Array for integration service
      const audioArray = new Float32Array(audioData.length / 4)
      for (let i = 0; i < audioArray.length; i++) {
        audioArray[i] = audioData.readFloatLE(i * 4)
      }
      
      // Use the integration service to process audio
      return new Promise((resolve, reject) => {
        let resolved = false
        
        const handleTranscription = (result: IntegrationTranscriptionResult, source: string) => {
          if (!resolved) {
            resolved = true
            const duration = Date.now() - startTime
            resolve(convertToLegacyResult(result, duration, source))
          }
        }
        
        const handleError = (error: Error) => {
          if (!resolved) {
            resolved = true
            reject(error)
          }
        }
        
        service.once('transcription', handleTranscription)
        service.once('error', handleError)
        
        // Start transcription - the service will handle mode selection
        service.startTranscription().catch(handleError)
        
        // Cleanup after timeout
        setTimeout(() => {
          if (!resolved) {
            resolved = true
            service.off('transcription', handleTranscription)
            service.off('error', handleError)
            reject(new Error('Transcription timeout'))
          }
        }, 30000) // 30 second timeout
      })
    } catch (error) {
      console.warn('WebSocket transcription failed, falling back to batch mode:', error)
      // Fall through to batch mode
    }
  }

  // Fallback to original batch mode
  return transcribeAudioBatch(audioData, options)
}

// Global integration service instance
let integrationService: GeminiLiveIntegrationService | null = null

/**
 * Initialize or get the integration service
 */
function getIntegrationService(options: TranscriptionOptions): GeminiLiveIntegrationService {
  if (!integrationService) {
    const apiKey = getApiKey(options)

    integrationService = GeminiLiveIntegrationFactory.createProduction(apiKey, {
      mode: options.mode || TranscriptionMode.HYBRID,
      fallbackToBatch: options.fallbackToBatch !== false,
      realTimeThreshold: options.realTimeThreshold || 1000,
      model: options.modelName || DEFAULT_GEMINI_MODEL
    })
  }

  return integrationService
}

/**
 * Get API key from options or environment variables
 */
function getApiKey(options: TranscriptionOptions): string {
  const apiKey =
    options.apiKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.error(
      'Transcription failed: Google API Key is required.',
      'Please set one of these environment variables:',
      '- GOOGLE_API_KEY',
      '- VITE_GOOGLE_API_KEY',
      '- GOOGLE_GENERATIVE_AI_API_KEY',
      '- GEMINI_API_KEY'
    )
    throw new Error(
      'Google API Key is required for transcription. Please check your environment variables.'
    )
  }

  return apiKey
}

/**
 * Check if WebSocket mode should be used based on feature flags and options
 */
function shouldUseWebSocket(options: TranscriptionOptions): boolean {
  // Check feature flag
  const webSocketEnabled = process.env.GEMINI_WEBSOCKET_ENABLED !== 'false'

  // Check explicit option
  if (options.enableWebSocket !== undefined) {
    return options.enableWebSocket && webSocketEnabled
  }

  // Use mode to determine WebSocket usage
  const mode = options.mode || TranscriptionMode.HYBRID
  return webSocketEnabled && (mode === TranscriptionMode.WEBSOCKET || mode === TranscriptionMode.HYBRID)
}

/**
 * Convert integration result to legacy format
 */
function convertToLegacyResult(
  result: IntegrationTranscriptionResult,
  duration: number,
  source: string
): TranscriptionResult {
  return {
    text: result.text,
    duration,
    confidence: result.confidence,
    source,
    timestamp: result.timestamp
  }
}

/**
 * Original batch transcription function (HTTP-based)
 * Used as fallback when WebSocket mode is not available or fails
 */
async function transcribeAudioBatch(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now()

  const apiKey = getApiKey(options)
  console.log('Using API key from environment (first 8 chars):', apiKey.substring(0, 8) + '...')

  const genAI = new GoogleGenAI({apiKey: apiKey as string})
  const modelName = options.modelName || DEFAULT_GEMINI_MODEL

  console.log(`Initializing batch transcription with Gemini model: ${modelName}`)

  // Assuming audioData is a WAV file buffer.
  // Ensure the mimeType matches your audio format.
  const audioFilePart = bufferToGenerativePart(audioData, 'audio/wav')

  // Construct the prompt for transcription.
  const promptParts = [audioFilePart, {text: 'Please transcribe the provided audio.'}]

  try {
    console.log(
      `Sending batch transcription request to Gemini at: ${new Date(startTime).toISOString()}`,
      `Audio buffer size: ${audioData.length} bytes`,
      `Model: ${modelName}`
    )

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{role: 'user', parts: promptParts}]
    })

    const endTime = Date.now()
    const duration = endTime - startTime
    console.log(`Batch transcription request completed in ${duration} ms`)

    const transcribedText = response.text

    if (typeof transcribedText !== 'string') {
      console.error(
        'Transcription failed: .text property did not return a string.',
        JSON.stringify(response, null, 2)
      )
      throw new Error(
        'Failed to transcribe audio: Unexpected issue with extracting text from Gemini response.'
      )
    }

    if (transcribedText.trim() === '') {
      console.warn(
        'Transcription resulted in empty text. This might be due to silence, unintelligible audio, or content filtering.',
        JSON.stringify(response, null, 2)
      )
    }

    return {
      text: transcribedText.trim(),
      duration,
      source: 'batch'
    }
  } catch (error: unknown) {
    const endTime = Date.now()
    const duration = endTime - startTime
    console.error(`Batch transcription failed after ${duration} ms with model ${modelName}:`)

    // Enhanced error logging for different types of errors
    if (error && typeof error === 'object') {
      const errorObj = error as {
        response?: {status?: number}
        message?: string
      }

      if (errorObj.response?.status) {
        console.error(`HTTP Status: ${errorObj.response.status}`)
        if (errorObj.response.status === 403) {
          console.error('API Key may be invalid or quota exceeded')
        } else if (errorObj.response.status === 400) {
          console.error('Bad request - check audio format or API parameters')
        }
      }

      if (errorObj.message?.includes('CORS')) {
        console.error('CORS error detected - this should not happen in main process!')
        console.error('If you see this, there might be a configuration issue.')
      }
    }

    // Log the error object itself for more details
    console.error('Full error details:', error)

    // More specific error logging if available
    if (error && typeof error === 'object') {
      const errorObj = error as {response?: {data?: unknown}; message?: string}

      if (errorObj.response && errorObj.response.data) {
        console.error('Gemini API Error details:', JSON.stringify(errorObj.response.data, null, 2))
      } else if (errorObj.message) {
        console.error('Error message:', errorObj.message)
      }
    }
    throw error // Re-throw the error to be handled by the caller
  }
}
