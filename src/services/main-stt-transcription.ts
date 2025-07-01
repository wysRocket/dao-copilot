import {GoogleGenAI} from '@google/genai'
import {TranscriptionMode} from './gemini-live-integration'
import {ResponseModality} from './gemini-live-websocket'
import {
  createLegacyWrapper,
  migrateLegacyConfig,
  LegacyAliases
} from './transcription-compatibility'
import {sanitizeLogMessage} from './log-sanitizer'

// Live API model for WebSocket (recommended half-cascade model)
const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-2.0-flash-live-001'

// Regular model for batch/REST API fallback
const DEFAULT_GEMINI_BATCH_MODEL = 'gemini-1.5-flash'

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
  // Check if WebSocket mode should be used
  if (shouldUseWebSocket(options)) {
    try {
      // For main process, we have audio data already - process it directly via WebSocket
      return await transcribeAudioViaWebSocket(audioData, options)
    } catch (error) {
      console.warn('WebSocket transcription failed, falling back to batch mode:', error)
      // Fall through to batch mode
    }
  }

  // Fallback to original batch mode
  return transcribeAudioBatch(audioData, options)
}

/**
 * Analyze WAV headers to extract audio format information
 */
function analyzeWavFormat(audioBuffer: Buffer): {
  isWav: boolean
  sampleRate?: number
  channels?: number
  bitDepth?: number
  dataOffset?: number
  dataSize?: number
} {
  // Check if buffer starts with RIFF header (WAV file)
  if (
    audioBuffer.length < 44 ||
    audioBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    audioBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return {isWav: false}
  }

  // Parse format chunk
  let offset = 12
  let formatData: {
    audioFormat?: number
    channels?: number
    sampleRate?: number
    bitDepth?: number
  } = {}

  while (offset < audioBuffer.length - 8) {
    const chunkId = audioBuffer.toString('ascii', offset, offset + 4)
    const chunkSize = audioBuffer.readUInt32LE(offset + 4)

    if (chunkId === 'fmt ') {
      // Parse format chunk with bounds checking
      if (offset + 24 <= audioBuffer.length) {
        const audioFormat = audioBuffer.readUInt16LE(offset + 8)
        const channels = audioBuffer.readUInt16LE(offset + 10)
        const sampleRate = audioBuffer.readUInt32LE(offset + 12)
        const bitDepth = audioBuffer.readUInt16LE(offset + 22)

        formatData = {audioFormat, channels, sampleRate, bitDepth}
      } else {
        console.warn('Incomplete fmt chunk: buffer too short')
      }
    } else if (chunkId === 'data') {
      return {
        isWav: true,
        sampleRate: formatData.sampleRate,
        channels: formatData.channels,
        bitDepth: formatData.bitDepth,
        dataOffset: offset + 8,
        dataSize: chunkSize
      }
    }

    // Move to next chunk
    offset += 8 + chunkSize
  }

  return {isWav: true, ...formatData}
}

/**
 * Strip WAV headers from audio buffer if present, return raw PCM data
 */
function stripWavHeaders(audioBuffer: Buffer): Buffer {
  // Check if buffer starts with RIFF header (WAV file)
  if (
    audioBuffer.length > 44 &&
    audioBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    audioBuffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    // Find the 'data' chunk
    let offset = 12
    while (offset < audioBuffer.length - 8) {
      const chunkId = audioBuffer.toString('ascii', offset, offset + 4)
      const chunkSize = audioBuffer.readUInt32LE(offset + 4)

      if (chunkId === 'data') {
        // Return PCM data starting after the data chunk header
        return audioBuffer.subarray(offset + 8, offset + 8 + chunkSize)
      }

      // Move to next chunk
      offset += 8 + chunkSize
    }
  }

  // Return original buffer if no WAV headers found
  return audioBuffer
}

/**
 * Resample PCM audio data to a target sample rate using linear interpolation
 * Currently supports resampling from 8000Hz to 16000Hz (2x upsampling)
 */
function resamplePcmAudio(
  pcmData: Buffer,
  fromSampleRate: number,
  toSampleRate: number,
  channels: number = 1,
  bitDepth: number = 16
): Buffer {
  // Only support 16-bit PCM for now
  if (bitDepth !== 16) {
    console.warn(`Unsupported bit depth ${bitDepth}, returning original audio`)
    return pcmData
  }

  // Calculate resampling ratio
  const ratio = toSampleRate / fromSampleRate

  // For exact 2x upsampling (8000 -> 16000), use simple duplication for better performance
  if (ratio === 2.0 && fromSampleRate === 8000 && toSampleRate === 16000) {
    console.log('Using optimized 2x upsampling for 8kHz -> 16kHz conversion')
    return upsample2x(pcmData, channels)
  }

  // General linear interpolation resampling
  console.log(
    `Resampling audio: ${fromSampleRate}Hz -> ${toSampleRate}Hz (ratio: ${ratio.toFixed(3)})`
  )

  const bytesPerSample = (bitDepth / 8) * channels
  const inputSamples = pcmData.length / bytesPerSample
  const outputSamples = Math.floor(inputSamples * ratio)
  const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample)

  for (let i = 0; i < outputSamples; i++) {
    const inputIndex = i / ratio
    const inputIndexFloor = Math.floor(inputIndex)
    const inputIndexCeil = Math.min(inputIndexFloor + 1, inputSamples - 1)
    const fraction = inputIndex - inputIndexFloor

    for (let channel = 0; channel < channels; channel++) {
      const sample1Offset = inputIndexFloor * bytesPerSample + channel * 2
      const sample2Offset = inputIndexCeil * bytesPerSample + channel * 2
      const outputOffset = i * bytesPerSample + channel * 2

      // Read 16-bit samples (little-endian)
      const sample1 = sample1Offset < pcmData.length ? pcmData.readInt16LE(sample1Offset) : 0
      const sample2 = sample2Offset < pcmData.length ? pcmData.readInt16LE(sample2Offset) : 0

      // Linear interpolation
      const interpolatedSample = Math.round(sample1 + (sample2 - sample1) * fraction)

      // Clamp to 16-bit range
      const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample))

      // Write to output buffer
      outputBuffer.writeInt16LE(clampedSample, outputOffset)
    }
  }

  return outputBuffer
}

/**
 * Optimized 2x upsampling for 8kHz -> 16kHz conversion
 * Uses linear interpolation between samples for better quality
 */
function upsample2x(pcmData: Buffer, channels: number = 1): Buffer {
  const bytesPerSample = 2 * channels // 16-bit = 2 bytes per channel
  const inputSamples = pcmData.length / bytesPerSample
  const outputBuffer = Buffer.alloc(pcmData.length * 2) // Double the size

  for (let i = 0; i < inputSamples; i++) {
    const inputOffset = i * bytesPerSample
    const outputOffset1 = i * 2 * bytesPerSample
    const outputOffset2 = (i * 2 + 1) * bytesPerSample

    for (let channel = 0; channel < channels; channel++) {
      const channelOffset = channel * 2

      // Read current sample (16-bit signed, little-endian)
      const currentSample = pcmData.readInt16LE(inputOffset + channelOffset)

      // Get next sample for interpolation (or use current if at end)
      let nextSample = currentSample
      if (i < inputSamples - 1) {
        const nextInputOffset = (i + 1) * bytesPerSample
        nextSample = pcmData.readInt16LE(nextInputOffset + channelOffset)
      }

      // Write current sample
      outputBuffer.writeInt16LE(currentSample, outputOffset1 + channelOffset)

      // Write interpolated sample (halfway between current and next)
      const interpolatedSample = Math.round((currentSample + nextSample) / 2)
      const clampedSample = Math.max(-32768, Math.min(32767, interpolatedSample))
      outputBuffer.writeInt16LE(clampedSample, outputOffset2 + channelOffset)
    }
  }

  return outputBuffer
}

/**
 * Transcribe audio directly via WebSocket without audio capture
 * This is used in the main process when audio data is already available
 */
async function transcribeAudioViaWebSocket(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const startTime = Date.now()
  const apiKey = getApiKey(options)

  // Import WebSocket client directly
  const {default: GeminiLiveWebSocketClient} = await import('./gemini-live-websocket')

  const client = new GeminiLiveWebSocketClient({
    apiKey,
    model: options.modelName || DEFAULT_GEMINI_LIVE_MODEL, // Use Live API model for WebSocket
    responseModalities: [ResponseModality.TEXT], // Optimize for text transcription
    systemInstruction:
      'You are a speech-to-text transcription assistant. Provide accurate, concise transcriptions of the audio input. Focus on clarity and accuracy.',
    connectionTimeout: 15000, // Increased timeout for better reliability
    maxQueueSize: 50 // Optimized queue size for transcription
  })

  try {
    // Connect to WebSocket
    await client.connect()

    // Analyze and strip WAV headers if present to get raw PCM data
    const audioFormat = analyzeWavFormat(audioData)
    console.log('Audio format analysis:', audioFormat)

    let pcmData = stripWavHeaders(audioData)
    console.log(`Original audio: ${audioData.length} bytes, PCM data: ${pcmData.length} bytes`)

    // Get audio format information
    const originalSampleRate = audioFormat.sampleRate || 16000
    const channels = audioFormat.channels || 1
    const bitDepth = audioFormat.bitDepth || 16

    // Gemini Live API requires 16000Hz sample rate
    const targetSampleRate = 16000

    if (originalSampleRate !== targetSampleRate) {
      console.log(
        `Resampling audio from ${originalSampleRate}Hz to ${targetSampleRate}Hz for Gemini Live API compatibility`
      )
      pcmData = resamplePcmAudio(pcmData, originalSampleRate, targetSampleRate, channels, bitDepth)
      console.log(`Resampled PCM data: ${pcmData.length} bytes`)
    } else {
      console.log(`Audio sample rate is already ${targetSampleRate}Hz, no resampling needed`)
    }

    // Validate audio format for Gemini Live API compatibility
    if (audioFormat.isWav) {
      if (channels !== 1) {
        console.warn(
          `Audio has ${channels} channels, but Gemini Live API expects mono (1 channel). This may cause issues.`
        )
      }
      if (bitDepth !== 16) {
        console.warn(
          `Audio has ${bitDepth}-bit depth, but Gemini Live API expects 16-bit. This may cause issues.`
        )
      }
    }

    // Check audio data size - Gemini Live API is designed for chunked streaming
    const maxChunkSize = 32 * 1024 // 32KB chunks for optimized streaming performance with Live API
    if (pcmData.length > maxChunkSize) {
      console.log(
        `Audio data is ${pcmData.length} bytes, chunking into ${maxChunkSize} byte segments for streaming`
      )
      // Send audio in chunks for better compatibility with Live API
      const chunks = []
      for (let i = 0; i < pcmData.length; i += maxChunkSize) {
        chunks.push(pcmData.subarray(i, i + maxChunkSize))
      }

      console.log(`Chunked audio data into ${chunks.length} chunks of ${maxChunkSize} bytes each`)

      // Send audio chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const base64Audio = chunk.toString('base64')

        console.log(`Sending chunk ${i + 1}/${chunks.length}: ${chunk.length} bytes`)

        await client.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: 'audio/pcm' // Gemini Live API expects plain "audio/pcm"
          }
        })

        // Optional: Add a small delay between chunks to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      console.log(`Finished sending all ${chunks.length} audio chunks`)
    } else {
      // Always use plain audio/pcm MIME type (without rate parameter) for Gemini Live API
      const mimeType = 'audio/pcm'
      console.log(`Using MIME type: ${mimeType}`)
      console.log(
        `Final audio data size: ${pcmData.length} bytes (${(pcmData.length / (2 * channels * targetSampleRate)).toFixed(2)}s duration)`
      )

      // Convert resampled PCM data to base64 for WebSocket transmission
      const base64Audio = pcmData.toString('base64')
      console.log(
        `Base64 encoded audio size: ${sanitizeLogMessage(base64Audio.length.toString())} characters`
      )

      // Send audio data for real-time processing with correct MIME type for Gemini Live API
      await client.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType // Use plain "audio/pcm" as per API documentation
        }
      })
    }

    // Wait for transcription response
    return new Promise((resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('WebSocket transcription timeout'))
        }
      }, 30000) // 30 second timeout for better reliability

      // Enhanced transcription handling with partial response support
      let partialText = ''
      let bestConfidence = 0
      let lastUpdateTime = Date.now()

      // Fallback: resolve with partial text if we have reasonable content after some time
      const partialTimeout = setTimeout(() => {
        if (!resolved && partialText && Date.now() - lastUpdateTime > 2000) {
          resolved = true
          clearTimeout(timeout)

          const duration = Date.now() - startTime
          resolve({
            text: partialText,
            duration,
            confidence: bestConfidence,
            source: 'websocket-partial'
          })
        }
      }, 10000) // Check for partial results after 10 seconds

      client.on(
        'transcriptionUpdate',
        (data: {text?: string; confidence?: number; isFinal?: boolean}) => {
          if (!resolved && data.text?.trim()) {
            partialText = data.text.trim()
            bestConfidence = Math.max(bestConfidence, data.confidence || 0)
            lastUpdateTime = Date.now()

            // If this is a final transcription or high confidence, resolve immediately
            if (data.isFinal || (data.confidence && data.confidence > 0.8)) {
              resolved = true
              clearTimeout(timeout)
              clearTimeout(partialTimeout)

              const duration = Date.now() - startTime
              resolve({
                text: partialText,
                duration,
                confidence: data.confidence || bestConfidence,
                source: 'websocket'
              })
            }
          }
        }
      )

      client.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          clearTimeout(partialTimeout)
          reject(error)
        }
      })
    })
  } finally {
    // Cleanup: disconnect the WebSocket
    try {
      await client.disconnect()
    } catch (error) {
      console.warn('Error disconnecting WebSocket client:', error)
    }
  }
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
  return (
    webSocketEnabled && (mode === TranscriptionMode.WEBSOCKET || mode === TranscriptionMode.HYBRID)
  )
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
  // Use regular Gemini model for batch API (Live models don't support generateContent)
  const modelName = options.modelName || DEFAULT_GEMINI_BATCH_MODEL

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

// Legacy compatibility wrapper for backward compatibility
const originalTranscribeAudio = transcribeAudio as (...args: unknown[]) => unknown

/**
 * Legacy-compatible transcription function with automatic option migration
 */
export const transcribeAudioLegacy = createLegacyWrapper(originalTranscribeAudio, 'transcribeAudio')

/**
 * Enhanced transcription function that automatically detects and migrates legacy options
 */
export async function transcribeAudioWithCompatibility(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  // Migrate legacy configuration options if needed (cast to compatible type)
  const migrationResult = migrateLegacyConfig(options as Parameters<typeof migrateLegacyConfig>[0])

  if (migrationResult.isLegacy) {
    console.warn('Legacy configuration detected. Consider migrating to the new format.')
    if (migrationResult.deprecations.length > 0) {
      migrationResult.deprecations.forEach(deprecation => {
        console.warn(`[DEPRECATION] ${deprecation}`)
      })
    }
  }

  return transcribeAudio(audioData, migrationResult.newConfig as TranscriptionOptions)
}

// Export legacy aliases for backward compatibility
export const {
  transcribeAudioLegacy: legacyTranscribeAudioAlias,
  createLegacyConfig: createLegacyTranscriptionConfig,
  setupLegacyEnvironment: setupLegacyTranscriptionEnvironment
} = LegacyAliases
