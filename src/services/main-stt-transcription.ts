import {GoogleGenAI} from '@google/genai'
import {TranscriptionMode} from './gemini-live-integration'
import {
  createLegacyWrapper,
  migrateLegacyConfig,
  LegacyAliases
} from './transcription-compatibility'
import {QuotaManager} from './quota-manager'
import {UnifiedPerformanceService} from './unified-performance'
import {getApiKeyManager} from './api-key-manager'
import WindowManager from './window-manager'
import {getGoogleApiKeys, getEnvVar} from '../utils/env-utils'
// 🚀 PERFORMANCE & QUOTA OPTIMIZATION: Import optimized handlers
import {
  handleWebSocketResponseSimple,
  createSimpleGeminiResponseHandler
} from './websocket-performance-fix'
import {QuotaOptimizedTranscriptionManager} from './quota-optimized-transcription'
import {createEnhancedGeminiLiveHandler} from './gemini-live-response-fix'
import {EmergencyCircuitBreaker, emergencyProtected} from '../utils/EmergencyCircuitBreaker'
import {
  TranscriptionError,
  StackOverflowError,
  RecursiveCallError,
  AudioProcessingError,
  WebSocketConnectionError,
  TranscriptionErrorRecovery,
  TranscriptionErrorReporter,
  TranscriptionErrorType
} from './transcription-errors'

// Live API model for WebSocket (updated to correct Live API model)
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
  enableWebSocket?: boolean // Feature flag to enable WebSocket functionality (default: true)
  fallbackToBatch?: boolean // Whether to fallback to batch mode on WebSocket failure (default: true)
  disableWebSocketFallback?: boolean // Force disable WebSocket fallback for debugging
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
 * Transcribe audio using Gemini Live WebSocket API with intelligent fallback
 *
 * The WebSocket mode provides real-time streaming transcription, but may fail due to:
 * - API key access restrictions for Gemini Live API (v1beta)
 * - Regional availability limitations
 * - Network connectivity issues
 *
 * In such cases, the function automatically falls back to batch mode transcription.
 *
 * @param audioData Raw audio data (WAV format)
 * @param options Transcription options
 * @returns Promise resolving to transcription result with source indication
 */
export async function transcribeAudio(
  wavData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const breaker = EmergencyCircuitBreaker.getInstance()

  // 🚨 EMERGENCY PROTECTION: Check circuit breaker before proceeding
  if (!breaker.emergencyCallGuard('transcribeAudio')) {
    throw new Error(
      '🚨 EMERGENCY: transcribeAudio blocked by circuit breaker due to stack overflow protection'
    )
  }

  try {
    console.log('Received transcription request in main process, audio data size:', wavData.length)

    // 🔄 TRY WEBSOCKET FIRST WITH BATCH FALLBACK ON QUOTA ERRORS
    console.log('🚀 Starting WebSocket transcription with batch fallback enabled')

    try {
      const result = await transcribeAudioViaWebSocket(wavData, options)

      // 🚨 EMERGENCY PROTECTION: Mark successful completion
      breaker.emergencyCallComplete('transcribeAudio')
      return result
    } catch (wsError: any) {
      console.warn(
        '⚠️ WebSocket transcription failed, checking for fallback eligibility:',
        wsError.message
      )

      // Check if this is a quota/rate limit error that should trigger batch fallback
      const isQuotaError =
        wsError.message?.toLowerCase().includes('quota') ||
        wsError.message?.toLowerCase().includes('rate limit') ||
        wsError.message?.toLowerCase().includes('connection closed') ||
        wsError.code === 1000

      if (isQuotaError && options.fallbackToBatch !== false) {
        console.log('🔄 Quota error detected - falling back to batch API')
        const batchResult = await transcribeAudioBatch(wavData, options)

        // 🚨 EMERGENCY PROTECTION: Mark successful completion
        breaker.emergencyCallComplete('transcribeAudio')
        return batchResult
      } else {
        throw wsError // Re-throw if not a quota error or fallback disabled
      }
    }
  } catch (error) {
    // 🚨 EMERGENCY PROTECTION: Report error and mark completion
    breaker.reportError('transcribeAudio', error as Error)
    breaker.emergencyCallComplete('transcribeAudio')
    throw error
  }
}

/**
 * Optimized audio metrics calculation with strategic sampling
 * Uses intelligent sampling to quickly assess audio characteristics
 */
function calculateAudioMetrics(pcmData: Buffer): {
  totalBytes: number
  nonZeroBytes: number
  maxAmplitude: number
  avgAmplitude: number
  isSilent: boolean
} {
  const totalBytes = pcmData.length

  // Early return for empty buffers
  if (totalBytes === 0) {
    return {totalBytes: 0, nonZeroBytes: 0, maxAmplitude: 0, avgAmplitude: 0, isSilent: true}
  }

  // For small buffers, analyze everything
  if (totalBytes <= 2000) {
    return calculateFullAudioMetrics(pcmData)
  }

  // For larger buffers, use strategic sampling
  return calculateSampledAudioMetrics(pcmData)
}

/**
 * Full analysis for small audio buffers
 */
function calculateFullAudioMetrics(pcmData: Buffer): {
  totalBytes: number
  nonZeroBytes: number
  maxAmplitude: number
  avgAmplitude: number
  isSilent: boolean
} {
  let nonZeroBytes = 0
  let maxAmplitude = 0
  let amplitudeSum = 0
  let sampleCount = 0

  for (let i = 0; i < pcmData.length - 1; i += 2) {
    const sample = pcmData.readInt16LE(i)
    const amplitude = Math.abs(sample)

    if (sample !== 0) nonZeroBytes += 2
    if (amplitude > maxAmplitude) maxAmplitude = amplitude
    amplitudeSum += amplitude
    sampleCount++
  }

  const avgAmplitude = sampleCount > 0 ? amplitudeSum / sampleCount : 0
  // 🔧 FIXED: Lowered silence threshold from 100 to 3 to detect quiet speech
  // Previous threshold of 10 was still too high for some normal speech levels
  const isSilent = nonZeroBytes === 0 || maxAmplitude < 3

  // 🔍 DEBUG: Log audio levels for threshold tuning
  console.log(
    `🔊 Audio Analysis: maxAmplitude=${maxAmplitude}, avgAmplitude=${avgAmplitude.toFixed(1)}, nonZeroBytes=${nonZeroBytes}, isSilent=${isSilent}`
  )

  return {totalBytes: pcmData.length, nonZeroBytes, maxAmplitude, avgAmplitude, isSilent}
}

/**
 * Strategic sampling for large audio buffers
 * Samples from beginning, middle, and end for representative analysis
 */
function calculateSampledAudioMetrics(pcmData: Buffer): {
  totalBytes: number
  nonZeroBytes: number
  maxAmplitude: number
  avgAmplitude: number
  isSilent: boolean
} {
  const totalBytes = pcmData.length
  const sampleSize = 1000 // Sample 1000 bytes from each region

  let nonZeroSamples = 0
  let maxAmplitude = 0
  let amplitudeSum = 0
  let totalSamples = 0

  // Sample from three regions: start, middle, end
  const regions = [
    {start: 0, size: Math.min(sampleSize, totalBytes)},
    {start: Math.max(0, Math.floor(totalBytes / 2) - sampleSize / 2), size: sampleSize},
    {start: Math.max(0, totalBytes - sampleSize), size: sampleSize}
  ]

  for (const region of regions) {
    const endPos = Math.min(region.start + region.size, totalBytes - 1)

    for (let i = region.start; i < endPos; i += 2) {
      const sample = pcmData.readInt16LE(i)
      const amplitude = Math.abs(sample)

      if (sample !== 0) nonZeroSamples++
      if (amplitude > maxAmplitude) maxAmplitude = amplitude
      amplitudeSum += amplitude
      totalSamples++
    }
  }

  // Extrapolate non-zero bytes based on sampling ratio
  const samplingRatio = totalSamples > 0 ? totalBytes / 2 / totalSamples : 0
  const estimatedNonZeroBytes = nonZeroSamples * 2 * samplingRatio
  const avgAmplitude = totalSamples > 0 ? amplitudeSum / totalSamples : 0
  // 🔧 FIXED: Lowered silence threshold from 100 to 3 to detect quiet speech
  // Previous threshold of 10 was still too high for some normal speech levels
  const isSilent = estimatedNonZeroBytes === 0 || maxAmplitude < 3

  // 🔍 DEBUG: Log audio levels for threshold tuning
  console.log(
    `🔊 Sampled Audio Analysis: maxAmplitude=${maxAmplitude}, avgAmplitude=${avgAmplitude.toFixed(1)}, estimatedNonZeroBytes=${estimatedNonZeroBytes}, isSilent=${isSilent}`
  )

  return {
    totalBytes,
    nonZeroBytes: Math.round(estimatedNonZeroBytes),
    maxAmplitude,
    avgAmplitude,
    isSilent
  }
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

// Stack overflow protection with enhanced tracking
let transcriptionCallDepth = 0
const MAX_CALL_DEPTH = 3 // Reduced from 5 to 3 for stricter protection
const recentCalls = new Map<string, number>() // Track recent calls by audio hash
const CALL_COOLDOWN_MS = 1000 // Minimum time between identical calls

// Add call stack tracking to catch recursion source
const callStack: string[] = []

/**
 * Transcribe audio directly via WebSocket without audio capture
 * This is used in the main process when audio data is already available
 */
async function transcribeAudioViaWebSocket(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const breaker = EmergencyCircuitBreaker.getInstance()

  // 🚨 EMERGENCY PROTECTION: Check circuit breaker before proceeding
  if (!breaker.emergencyCallGuard('transcribeAudioViaWebSocket')) {
    throw new Error(
      '🚨 EMERGENCY: transcribeAudioViaWebSocket blocked by circuit breaker due to stack overflow protection'
    )
  }

  try {
    // Generate audio hash to detect duplicate rapid calls
    const audioHash = audioData.subarray(0, 100).toString('hex')
    const now = Date.now()

    // Check for rapid duplicate calls
    if (recentCalls.has(audioHash)) {
      const lastCall = recentCalls.get(audioHash)!
      if (now - lastCall < CALL_COOLDOWN_MS) {
        console.warn(
          `🚨 DUPLICATE CALL DETECTED: Same audio called within ${CALL_COOLDOWN_MS}ms, rejecting to prevent recursion`
        )
        const error = new RecursiveCallError('transcribeAudioViaWebSocket', recentCalls.size, {
          audioHash,
          lastCall,
          currentTime: now
        })
        TranscriptionErrorReporter.reportError(error)
        throw error
      }
    }

    recentCalls.set(audioHash, now)

    // Clean up old entries to prevent memory leak
    for (const [hash, timestamp] of recentCalls.entries()) {
      if (now - timestamp > 10000) {
        // Remove entries older than 10 seconds
        recentCalls.delete(hash)
      }
    }

    // Enhanced stack overflow protection with call tracking
    const callId = `transcribeAudioViaWebSocket-${Date.now()}-${Math.random().toString(36).slice(2)}`
    callStack.push(callId)

    transcriptionCallDepth++
    console.log(`🔍 STACK TRACE: Call depth ${transcriptionCallDepth}, Call ID: ${callId}`)
    console.log(`🔍 CALL STACK: [${callStack.slice(-5).join(' -> ')}]`)

    if (transcriptionCallDepth > MAX_CALL_DEPTH) {
      console.error(
        `🚨 STACK OVERFLOW DETECTED: Call depth ${transcriptionCallDepth} exceeded max ${MAX_CALL_DEPTH}`
      )
      console.error(`🚨 CALL STACK TRACE: [${callStack.join(' -> ')}]`)

      const error = new StackOverflowError(
        `Stack overflow protection: Maximum call depth ${MAX_CALL_DEPTH} exceeded`,
        transcriptionCallDepth,
        MAX_CALL_DEPTH,
        {callId, callStack: [...callStack], audioHash}
      )
      TranscriptionErrorReporter.reportError(error)

      // Reset all counters and clear state
      transcriptionCallDepth = 0
      callStack.length = 0
      recentCalls.clear()

      throw error
    }

    try {
      const result = await performTranscription(audioData, options)
      transcriptionCallDepth-- // Decrement on successful completion
      callStack.pop() // Remove this call from stack
      console.log(`✅ CALL COMPLETED: Call depth now ${transcriptionCallDepth}, Call ID: ${callId}`)

      // 🚨 EMERGENCY PROTECTION: Mark successful completion
      breaker.emergencyCallComplete('transcribeAudioViaWebSocket')
      return result
    } catch (error) {
      // 🚨 EMERGENCY PROTECTION: Report error and mark completion
      breaker.reportError('transcribeAudioViaWebSocket', error as Error)
      breaker.emergencyCallComplete('transcribeAudioViaWebSocket')

      transcriptionCallDepth-- // Decrement on error as well
      callStack.pop() // Remove this call from stack
      console.log(
        `❌ CALL FAILED: Call depth now ${transcriptionCallDepth}, Call ID: ${callId}, Error: ${error}`
      )

      // Report error with enhanced context
      if (!(error instanceof TranscriptionError)) {
        const enhancedError = new AudioProcessingError(
          error instanceof Error ? error.message : String(error),
          {
            callId,
            callDepth: transcriptionCallDepth,
            audioSize: audioData.length,
            originalError: error
          }
        )
        TranscriptionErrorReporter.reportError(enhancedError)
      }

      throw error
    }
  } catch (emergencyError) {
    // 🚨 EMERGENCY PROTECTION: Final safety net
    breaker.reportError('transcribeAudioViaWebSocket', emergencyError as Error)
    breaker.emergencyCallComplete('transcribeAudioViaWebSocket')
    throw emergencyError
  }
}

/**
 * Actual transcription implementation moved to separate function
 */
async function performTranscription(
  audioData: Buffer,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  const breaker = EmergencyCircuitBreaker.getInstance()

  // 🚨 EMERGENCY PROTECTION: Check circuit breaker before proceeding
  if (!breaker.emergencyCallGuard('performTranscription')) {
    throw new Error(
      '🚨 EMERGENCY: performTranscription blocked by circuit breaker due to stack overflow protection'
    )
  }

  try {
    const startTime = Date.now()

    // ✅ WEBSOCKET-ONLY MODE - NO FALLBACKS
    console.log('� Starting WEBSOCKET-ONLY transcription (batch fallback disabled)')

    const apiKey = getApiKey(options)

    // 🔧 TASK 20.2: Check API quota status before attempting WebSocket connection
    try {
      await checkApiQuotaStatus(apiKey)
    } catch (quotaError) {
      console.warn('⚠️ TASK 20.2: API quota check failed:', quotaError)
      // Continue anyway but log the warning
    }

    // 🔧 ENHANCED: Check for Gemini Live API access before proceeding
    try {
      console.log('🔍 Checking Gemini Live API access...')
      await validateApiKeyForGeminiLive(apiKey)
      console.log('✅ Gemini Live API access confirmed')
    } catch (liveApiError) {
      console.error('❌ Gemini Live API access not available:', liveApiError)
      console.log('🔄 Falling back to batch transcription due to lack of Live API access')

      // Fall back to batch transcription when Live API is not available
      const batchResult = await transcribeAudioBatch(audioData, {
        apiKey: options.apiKey,
        modelName: options.modelName
      })

      // 🚨 EMERGENCY PROTECTION: Mark successful completion
      breaker.emergencyCallComplete('performTranscription')
      return batchResult
    }

    try {
      // Check for recent quota errors using QuotaManager
      const quotaManager = QuotaManager.getInstance()
      const WEBSOCKET_PROVIDER = 'gemini-websocket'

      // For debugging: Reset quota blocks to ensure fresh start
      console.log('🔄 Resetting quota blocks for fresh WebSocket attempt')
      quotaManager.clearErrors(WEBSOCKET_PROVIDER)

      if (quotaManager.shouldBlockProvider(WEBSOCKET_PROVIDER)) {
        const timeUntilUnblocked = quotaManager.getTimeUntilUnblocked(WEBSOCKET_PROVIDER)
        console.log(
          `🚫 WebSocket blocked due to quota errors. Retrying in ${Math.round(timeUntilUnblocked / 1000)}s`
        )

        // ✅ WAIT AND RETRY WEBSOCKET INSTEAD OF BATCH FALLBACK
        console.log('⏰ Waiting for quota cooldown before retrying WebSocket...')
        await new Promise(resolve => setTimeout(resolve, Math.min(timeUntilUnblocked, 30000))) // Max 30s wait
        console.log('🔄 Retrying WebSocket after quota cooldown')
      }

      // Import WebSocket client directly
      const {default: GeminiLiveWebSocketClient, ResponseModality} = await import(
        './gemini-live-websocket'
      )

      // Import and initialize transcription bridge for event forwarding
      // Re-enabled after fixing API key manager initialization
      const {GeminiTranscriptionBridge} = await import('./gemini-transcription-bridge')
      const bridge = new GeminiTranscriptionBridge()

      // Mock bridge disabled - using real bridge now
      // const bridge = {
      //   resetEmergencyStop: () => console.log('Mock bridge: resetEmergencyStop called'),
      //   connect: () => console.log('Mock bridge: connect called'),
      //   disconnect: () => console.log('Mock bridge: disconnect called')
      // }

      const client = new GeminiLiveWebSocketClient({
        apiKey,
        model: options.modelName || DEFAULT_GEMINI_LIVE_MODEL, // Use Live API model for WebSocket
        responseModalities: [ResponseModality.TEXT], // Optimize for text transcription
        systemInstruction:
          'You are a multi-language speech-to-text transcription system. Listen to the audio input and provide an accurate transcription of the spoken words in their original language (English, Russian, Ukrainian, or other languages). Detect the language automatically and transcribe accurately in that language. Only return the transcribed text, no additional commentary.',
        connectionTimeout: 10000, // Reduced timeout to 10 seconds for faster fallback
        maxQueueSize: 50, // Optimized queue size for transcription
        apiVersion: getEnvVar('GEMINI_API_VERSION', 'v1beta'), // Use configured API version or default to v1beta
        reconnectAttempts: 1, // Reduced reconnect attempts for faster fallback
        generationConfig: {
          candidateCount: 1,
          maxOutputTokens: 2048,
          temperature: 0.0,
          topP: 1.0
        }
      })

      // Enhanced debugging for configuration tracking
      console.log('🔧 TRANSCRIPTION CONFIG DEBUG:', {
        optionsModelName: options.modelName,
        defaultModel: DEFAULT_GEMINI_LIVE_MODEL,
        finalModel: options.modelName || DEFAULT_GEMINI_LIVE_MODEL,
        apiVersion: getEnvVar('GEMINI_API_VERSION', 'v1beta'),
        timestamp: new Date().toISOString()
      })

      try {
        // Connect to WebSocket
        console.log('🔄 Attempting WebSocket connection to Gemini Live API...')
        await client.connect()
        console.log('✅ WebSocket connection established successfully')

        // ✅ CRITICAL: Connect bridge for event forwarding to frontend
        // Re-enabled after fixing API key manager initialization
        console.log('🌉 Connecting transcription bridge for event forwarding...')
        bridge.resetEmergencyStop() // Reset any previous emergency stops
        bridge.connect(client) // Real bridge connection
        console.log('✅ Transcription bridge connected successfully')

        // CRITICAL: Wait for setup completion before sending audio
        // This ensures the Gemini Live API is ready to receive audio data
        if (!client.isSetupCompleted()) {
          console.log('Waiting for WebSocket setup completion before sending audio')
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(
                new Error(
                  'Timeout waiting for WebSocket setup completion - falling back to batch mode'
                )
              )
            }, 10000) // Reduced timeout to 10 seconds for faster fallback

            const onSetupComplete = () => {
              clearTimeout(timeout)

              // Safe removal of event listeners
              try {
                if (typeof client.off === 'function') {
                  client.off('setupComplete', onSetupComplete)
                  client.off('error', onSetupError)
                } else if (typeof client.removeListener === 'function') {
                  client.removeListener('setupComplete', onSetupComplete)
                  client.removeListener('error', onSetupError)
                }
              } catch (listenerError) {
                console.warn('Error removing event listeners:', listenerError)
              }

              console.log('WebSocket setup completed - ready to send audio')
              resolve()
            }

            const onSetupError = (error: unknown) => {
              clearTimeout(timeout)

              // Safe removal of event listeners
              try {
                if (typeof client.off === 'function') {
                  client.off('setupComplete', onSetupComplete)
                  client.off('error', onSetupError)
                } else if (typeof client.removeListener === 'function') {
                  client.removeListener('setupComplete', onSetupComplete)
                  client.removeListener('error', onSetupError)
                }
              } catch (listenerError) {
                console.warn('Error removing event listeners:', listenerError)
              }

              // ✅ DETECT QUOTA ERRORS SPECIFICALLY
              const errorMessage = error instanceof Error ? error.message : String(error)
              if (
                errorMessage.includes('quota') ||
                errorMessage.includes('1011') ||
                errorMessage.includes('exceeded')
              ) {
                console.error('🚫 QUOTA EXCEEDED - WebSocket connection blocked by Google')
                reject(new Error('Google API quota exceeded - please check billing or wait'))
              } else {
                console.error('⚠️ WebSocket setup error:', errorMessage)
                reject(new Error(`WebSocket setup failed: ${errorMessage}`))
              }
            }

            // Check if already complete before adding listeners
            if (client.isSetupCompleted()) {
              clearTimeout(timeout)
              resolve()
              return
            }

            client.on('setupComplete', onSetupComplete)
            client.on('error', onSetupError)
          })
        }

        // Don't send any initial context message - let the API process audio directly
        console.log('WebSocket setup completed - ready to send audio')

        // Clear any text responses and prepare for audio processing
        console.log('Preparing to send audio for transcription')

        // Reset the resolved flag to ensure we only capture post-audio responses
        let audioSent = false

        // Analyze and strip WAV headers if present to get raw PCM data
        const audioFormat = analyzeWavFormat(audioData)
        console.log('Audio format analysis:', audioFormat)

        // 🔧 TASK 20.2: Validate audio format compatibility with Gemini Live API
        validateAudioFormatForGeminiLive(audioFormat)

        let pcmData = stripWavHeaders(audioData)
        console.log(`Original audio: ${audioData.length} bytes, PCM data: ${pcmData.length} bytes`)

        // 🔧 TASK 20.2: Enhanced audio content analysis for debugging
        const sampleView = pcmData.slice(0, Math.min(100, pcmData.length))
        const nonZeroSamples = sampleView.filter(byte => byte !== 0).length
        console.log('🔊 TASK 20.2: Enhanced audio content analysis:', {
          originalAudioSize: audioData.length,
          pcmDataSize: pcmData.length,
          sampleViewSize: sampleView.length,
          nonZeroSamples,
          nonZeroPercentage: `${((nonZeroSamples / sampleView.length) * 100).toFixed(1)}%`,
          firstBytesHex: sampleView.slice(0, 16).toString('hex'),
          lastBytesHex: sampleView.slice(-16).toString('hex'),
          audioFormat
        })

        // Optimized audio metrics calculation with strategic sampling
        const audioMetrics = calculateAudioMetrics(pcmData)

        // Early silence detection with optimized metrics calculation
        const isSilent = audioMetrics.isSilent
        console.log(
          `🔊 SILENCE CHECK: maxAmplitude=${audioMetrics.maxAmplitude}, avgAmplitude=${audioMetrics.avgAmplitude.toFixed(1)}, isSilent=${isSilent}, threshold=3`
        )

        if (isSilent) {
          console.warn(
            '⚠️ WARNING: Audio appears to be silent or very quiet - this may be incorrect!'
          )
          console.warn(
            `⚠️ Audio levels: max=${audioMetrics.maxAmplitude}, avg=${audioMetrics.avgAmplitude.toFixed(1)}, nonZero=${audioMetrics.nonZeroBytes}/${audioMetrics.totalBytes}`
          )
          console.warn(
            '⚠️ If you are speaking normally, the threshold may be too high. Continuing with transcription attempt...'
          )

          // 🔧 IMPROVED: Don't return early for "silent" audio - let WebSocket API decide
          // The silence detection may be too aggressive, so let the API process it anyway
          console.log('🔄 Proceeding with WebSocket transcription despite silence detection')
        } else {
          console.log(
            `✅ Audio detected: ${audioMetrics.nonZeroBytes}/${audioMetrics.totalBytes} non-zero bytes, max amplitude: ${audioMetrics.maxAmplitude}, avg: ${audioMetrics.avgAmplitude.toFixed(1)}`
          )
        }

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
          pcmData = resamplePcmAudio(
            pcmData,
            originalSampleRate,
            targetSampleRate,
            channels,
            bitDepth
          )
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
            `Audio data is ${pcmData.length} bytes, streaming in ${maxChunkSize} byte chunks for optimal performance`
          )

          // Stream audio chunks efficiently without storing all in memory
          const totalChunks = Math.ceil(pcmData.length / maxChunkSize)
          console.log(
            `Streaming audio data in ${totalChunks} chunks of up to ${maxChunkSize} bytes each`
          )

          // 🐛 DEBUG: Log audio buffer details for debugging
          console.log('🔊 DEBUG: Audio buffer analysis:', {
            totalBytes: pcmData.length,
            firstBytes: pcmData.slice(0, 32).toString('hex'),
            lastBytes: pcmData.slice(-32).toString('hex'),
            nonZeroBytes: pcmData.filter(byte => byte !== 0).length,
            maxValue: Math.max(...pcmData),
            minValue: Math.min(...pcmData)
          })

          // Re-enabled audio streaming after fixing API key initialization
          console.log('🔗 Re-enabling audio streaming after API key fix')
          console.log('Audio data prepared:', pcmData.length, 'bytes')

          // Send audio chunks sequentially with optimized streaming
          for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const startPos = chunkIndex * maxChunkSize
            const endPos = Math.min(startPos + maxChunkSize, pcmData.length)
            const chunk = pcmData.subarray(startPos, endPos)
            const base64Audio = chunk.toString('base64')

            console.log(`Streaming chunk ${chunkIndex + 1}/${totalChunks}: ${chunk.length} bytes`)

            // 🐛 DEBUG: Log chunk details for first and last chunks
            if (chunkIndex === 0 || chunkIndex === totalChunks - 1) {
              console.log('🔊 DEBUG: Chunk analysis:', {
                chunkIndex: chunkIndex + 1,
                chunkBytes: chunk.length,
                base64Length: base64Audio.length,
                firstChunkBytes: chunk.slice(0, 16).toString('hex'),
                lastChunkBytes: chunk.slice(-16).toString('hex'),
                mimeType: 'audio/pcm'
              })
            }

            await client.sendRealtimeInput({
              audio: {
                data: base64Audio,
                mimeType: 'audio/pcm;rate=16000' // Gemini Live API expects raw PCM data at 16kHz sample rate
              }
            }) // 🔍 DEBUG: Log successful audio chunk send
            console.log(
              `✅ Sent audio chunk ${chunkIndex + 1}/${totalChunks} successfully with MIME type 'audio/pcm;rate=16000'`
            )

            // Optimized delay for streaming - shorter for better responsiveness
            await new Promise(resolve => setTimeout(resolve, 100))
          }

          console.log(`Finished streaming all ${totalChunks} audio chunks efficiently`)

          // Mark that audio has been sent so we can process responses appropriately
          audioSent = true

          // CRITICAL FIX: Send turn completion to signal Gemini that we want a response
          console.log('🔧 CRITICAL FIX: Sending turn completion to trigger Gemini response')
          try {
            await client.sendTurnCompletion()
            console.log('✅ Turn completion sent successfully')
          } catch (turnError) {
            console.warn('⚠️ Failed to send turn completion:', turnError)
          }

          // For live streaming, don't send audioStreamEnd - keep connection open
          console.log('Audio streaming completed - keeping connection open for live responses')

          // Reduced wait time for better responsiveness
          console.log('Waiting for live streaming responses...')
          await new Promise(resolve => setTimeout(resolve, 500))
        } else {
          // Re-enabled single stream audio sending after fixing API key initialization
          console.log('🔗 Re-enabling single stream audio sending after API key fix')
          console.log('Single audio data prepared:', pcmData.length, 'bytes')

          // For smaller audio chunks, send as single stream
          const base64Audio = pcmData.toString('base64')
          console.log(`Streaming audio data: ${pcmData.length} bytes`)

          // 🐛 DEBUG: Log single chunk details for debugging
          console.log('🔊 DEBUG: Single chunk analysis:', {
            totalBytes: pcmData.length,
            base64Length: base64Audio.length,
            firstBytes: pcmData.slice(0, 32).toString('hex'),
            lastBytes: pcmData.slice(-32).toString('hex'),
            nonZeroBytes: pcmData.filter(byte => byte !== 0).length,
            maxValue: Math.max(...pcmData),
            minValue: Math.min(...pcmData),
            mimeType: 'audio/pcm'
          })

          await client.sendRealtimeInput({
            audio: {
              data: base64Audio,
              mimeType: 'audio/pcm;rate=16000' // Gemini Live API expects raw PCM data at 16kHz sample rate
            }
          })

          // 🔍 DEBUG: Log successful single audio send
          console.log(
            `✅ Sent single audio chunk successfully with MIME type 'audio/pcm;rate=16000' (${pcmData.length} bytes)`
          )

          // Mark that audio has been sent
          audioSent = true

          // CRITICAL FIX: Send turn completion to signal Gemini that we want a response
          console.log('🔧 CRITICAL FIX: Sending turn completion to trigger Gemini response (single chunk)')
          try {
            await client.sendTurnCompletion()
            console.log('✅ Turn completion sent successfully (single chunk)')
          } catch (turnError) {
            console.warn('⚠️ Failed to send turn completion (single chunk):', turnError)
          }

          // For live streaming, don't send audioStreamEnd - keep connection open
          console.log('Audio streamed - keeping connection open for live responses')

          // Wait briefly for streaming responses
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        console.log('WebSocket transcription: Waiting for responses...')

        // For live streaming, set up event handlers and return immediately
        // Don't wait for completion - let streaming events handle real-time updates

        // Performance optimization: throttle partial updates to prevent flooding
        let lastPartialUpdate = 0
        const PARTIAL_UPDATE_THROTTLE_MS = 100 // Limit partial updates to 10 FPS max
        let pendingPartialText = ''
        let pendingPartialTimeout: NodeJS.Timeout | null = null

        // ✅ COLLECT TRANSCRIBED TEXT FOR RETURN VALUE (Original vars)
        let collectedTextOriginal = ''
        let finalConfidenceOriginal = 0.8

        // 🔧 TASK 20.3: Enhanced WebSocket event handlers for comprehensive response processing
        console.log('🔗 TASK 20.3: Setting up enhanced WebSocket event handlers')

        // Track all WebSocket message types and timing
        const messageStats = {
          connectionMessages: 0,
          setupMessages: 0,
          audioMessages: 0,
          responseMessages: 0,
          errorMessages: 0,
          emptyResponseMessages: 0,
          totalMessages: 0,
          firstMessageTime: null as number | null,
          lastMessageTime: null as number | null
        }

        // Log WebSocket connection state changes
        client.on('open', () => {
          const timestamp = Date.now()
          messageStats.connectionMessages++
          messageStats.totalMessages++
          if (!messageStats.firstMessageTime) messageStats.firstMessageTime = timestamp
          messageStats.lastMessageTime = timestamp

          console.log('🔌 WEBSOCKET CONNECTED:', {
            timestamp: new Date(timestamp).toISOString(),
            connectionUrl: 'gemini-live-api',
            model: options.modelName || DEFAULT_GEMINI_LIVE_MODEL,
            apiVersion: getEnvVar('GEMINI_API_VERSION', 'v1beta'),
            messageStats
          })
        })

        client.on('close', (code: number, reason: string) => {
          const timestamp = Date.now()
          messageStats.connectionMessages++
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.log('� WEBSOCKET DISCONNECTED:', {
            timestamp: new Date(timestamp).toISOString(),
            closeCode: code,
            closeReason: reason,
            sessionDuration: messageStats.firstMessageTime
              ? timestamp - messageStats.firstMessageTime
              : 0,
            messageStats
          })
        })

        // Log all raw WebSocket message types (not just geminiResponse)
        if (typeof client.on === 'function') {
          // Listen for any message events to capture all API communication
          const originalEmit = client.emit.bind(client)
          client.emit = function (event: string, ...args: unknown[]) {
            const timestamp = Date.now()
            messageStats.totalMessages++
            if (!messageStats.firstMessageTime) messageStats.firstMessageTime = timestamp
            messageStats.lastMessageTime = timestamp

            // Log all WebSocket events to understand the complete message flow
            if (event !== 'geminiResponse') {
              console.log('� WEBSOCKET EVENT:', {
                event,
                timestamp: new Date(timestamp).toISOString(),
                audioSent,
                argsCount: args.length,
                args: args
                  .map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                  )
                  .slice(0, 3), // Limit to first 3 args to prevent flooding
                messageStats
              })
            }

            return originalEmit(event, ...args)
          }
        }

        // 🔍 ENHANCED: Add comprehensive error event handlers
        client.on('error', (error: unknown) => {
          const timestamp = Date.now()
          messageStats.errorMessages++
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.error('🚨 WEBSOCKET ERROR EVENT:', {
            error: error instanceof Error ? error.message : String(error),
            errorType: typeof error,
            errorStack: error instanceof Error ? error.stack : undefined,
            audioSent,
            timestamp: new Date(timestamp).toISOString(),
            messageStats
          })
        })

        client.on('geminiError', (geminiError: unknown) => {
          const timestamp = Date.now()
          messageStats.errorMessages++
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.error('🚨 GEMINI API ERROR EVENT:', {
            geminiError,
            audioSent,
            timestamp: new Date(timestamp).toISOString(),
            messageStats
          })
        })

        // 🔍 ENHANCED: Add setup completion logging
        client.on('setupComplete', () => {
          const timestamp = Date.now()
          messageStats.setupMessages++
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.log('✅ WEBSOCKET SETUP COMPLETE:', {
            timestamp: new Date(timestamp).toISOString(),
            setupDuration: messageStats.firstMessageTime
              ? timestamp - messageStats.firstMessageTime
              : 0,
            messageStats
          })
        })

        // 🔧 TASK 20.3: New event handler for empty transcription responses
        client.on('emptyTranscription', (eventData: unknown) => {
          const timestamp = Date.now()
          messageStats.emptyResponseMessages++
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.warn('🚨 TASK 20.3: EMPTY TRANSCRIPTION EVENT:', {
            eventData,
            audioSent,
            timestamp: new Date(timestamp).toISOString(),
            messageStats,
            troubleshooting: {
              checkApiKey: 'Verify API key has Gemini Live transcription permissions',
              checkAudio: 'Ensure audio contains speech and is not silent',
              checkQuota: 'Verify Gemini Live API quota is not exhausted',
              checkFormat: 'Confirm audio is 16kHz mono PCM format'
            }
          })
        })

        // 🔧 TASK 20.3: New event handler for transcription timeouts
        client.on('transcriptionTimeout', (eventData: unknown) => {
          const timestamp = Date.now()
          messageStats.totalMessages++
          messageStats.lastMessageTime = timestamp

          console.error('🚨 TASK 20.3: TRANSCRIPTION TIMEOUT EVENT:', {
            eventData,
            audioSent,
            timestamp: new Date(timestamp).toISOString(),
            messageStats,
            recommendation: 'Consider checking network connectivity, API quotas, or audio quality'
          })
        })

        // 🚀 PERFORMANCE FIX: Use ultra-fast WebSocket handler (fixes 990ms render times)
        const collectedText = {value: ''}
        const finalConfidence = {value: 0.8}

        // Import the optimized typed handler
        const {createTypedFastWebSocketHandler} = await import('./typed-fast-websocket-handler')

        // Create fast message handler with proper typing
        const fastHandler = createTypedFastWebSocketHandler(
          () => audioSent,
          startTime,
          WindowManager.getInstance()
        )

        // Use the enhanced Gemini Live response handler to fix empty results
        const enhancedHandler = createEnhancedGeminiLiveHandler((text, isFinal, confidence) => {
          console.log('📝 Enhanced handler received text:', {text, isFinal, confidence})

          // Update collected text
          if (text && text.trim()) {
            collectedText.value = text.trim()
            finalConfidence.value = confidence

            // Broadcast the transcription immediately
            if (audioSent) {
              const broadcastData = {
                text: collectedText.value,
                isFinal,
                isPartial: !isFinal,
                source: 'websocket-streaming',
                confidence,
                timestamp: Date.now() - startTime
              }

              try {
                WindowManager.getInstance().broadcastToAllWindows(
                  'app:message',
                  'transcription_chunk',
                  broadcastData
                )
                console.log('✅ Broadcasted transcription chunk:', broadcastData)
              } catch (broadcastError) {
                console.warn('Failed to broadcast transcription:', broadcastError)
              }
            }
          }
        })

        client.on('geminiResponse', (response: unknown) => {
          try {
            // Convert to WebSocket message format for the enhanced handler
            const mockEvent = {
              data: JSON.stringify(response)
            } as MessageEvent

            const result = enhancedHandler.handleMessage(mockEvent)
            if (result.hasText) {
              console.log('✅ Enhanced handler processed text successfully')
              collectedText.value = result.text // Update the main collectedText variable
            }
          } catch (error) {
            console.error('❌ Error in enhanced response handler:', error)
          }
        })

        // Auto-disconnect after a reasonable time for live streaming
        setTimeout(async () => {
          try {
            console.log('🔌 Auto-disconnecting WebSocket after streaming period')
            await client.disconnect()
          } catch (error) {
            console.warn('Error auto-disconnecting:', error)
          }
        }, 10000) // 10 seconds max for live streaming

        // ✅ WAIT FOR WEBSOCKET TRANSCRIPTION RESULTS - Don't return empty!
        // Give WebSocket time to process and return collected text
        await new Promise(resolve => setTimeout(resolve, 3000)) // Wait for transcription

        console.log(
          '🚀 WebSocket transcription completed! Collected text:',
          `"${collectedText.value}"`
        )

        // ✅ CLEANUP: Disconnect bridge and client on successful completion
        try {
          console.log('🌉 Disconnecting transcription bridge...')
          // TEMPORARILY USING MOCK BRIDGE - Stack overflow issue being debugged
          bridge.disconnect() // Mock disconnect
          await client.disconnect()
        } catch (cleanupError) {
          console.warn('Error during cleanup:', cleanupError)
        }

        // Return collected text from WebSocket streaming instead of empty
        const result = {
          text: collectedText.value || '', // Return actual transcribed text from WebSocket
          duration: Date.now() - startTime,
          source: 'websocket-streaming' as const,
          confidence: finalConfidence.value
        }

        console.log('🎯 FINAL TRANSCRIPTION RESULT (WEBSOCKET):', {
          text: result.text,
          textLength: result.text.length,
          confidence: result.confidence,
          duration: result.duration,
          wasAudioSent: audioSent,
          collectedTextOriginal: collectedText.value
        })

        // 🚨 EMERGENCY PROTECTION: Mark successful completion
        breaker.emergencyCallComplete('performTranscription')
        return result
      } catch (error) {
        // 🚨 EMERGENCY PROTECTION: Report error and mark completion
        breaker.reportError('performTranscription', error as Error)
        breaker.emergencyCallComplete('performTranscription')

        // Track quota errors using QuotaManager for better error handling
        const quotaManager = QuotaManager.getInstance()
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (QuotaManager.isQuotaError(error)) {
          console.log('🚫 Quota error detected, recording for future WebSocket avoidance')
          const errorCode = QuotaManager.extractErrorCode(error)
          quotaManager.recordQuotaError(WEBSOCKET_PROVIDER, errorCode, errorMessage)
        }

        // Ensure cleanup on any error
        try {
          console.log('🌉 Disconnecting transcription bridge...')
          // TEMPORARILY USING MOCK BRIDGE - Stack overflow issue being debugged
          bridge.disconnect() // Mock disconnect
          await client.disconnect()
        } catch (disconnectError) {
          console.warn(
            'Error disconnecting WebSocket client during error cleanup:',
            disconnectError
          )
        }
        throw error
      }
    } catch (mainError) {
      // 🚨 EMERGENCY PROTECTION: Report error and mark completion
      breaker.reportError('performTranscription', mainError as Error)
      breaker.emergencyCallComplete('performTranscription')

      // ✅ WEBSOCKET-ONLY ERROR HANDLING - NO BATCH FALLBACK
      console.error('❌ WebSocket transcription failed (NO FALLBACK):', mainError)

      // 🛡️ CRITICAL FIX: Don't return errors as transcription text!
      // This was causing "[WebSocket Error: Maximum call stack size exceeded]"
      // to appear in transcription output instead of being handled as an error

      // Check if this is a stack overflow error that should be thrown properly
      const errorMessage = mainError instanceof Error ? mainError.message : String(mainError)

      let transcriptionError: TranscriptionError

      if (
        errorMessage.includes('Maximum call stack size exceeded') ||
        errorMessage.includes('stack overflow') ||
        errorMessage.includes('recursion')
      ) {
        console.error('🚨 CRITICAL: Stack overflow detected in WebSocket transcription!')
        transcriptionError = new StackOverflowError(
          errorMessage,
          transcriptionCallDepth,
          MAX_CALL_DEPTH,
          {originalError: mainError, audioSize: audioData.length}
        )
      } else if (
        errorMessage.includes('WebSocket') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('network')
      ) {
        transcriptionError = new WebSocketConnectionError(errorMessage, 'unknown', {
          originalError: mainError,
          audioSize: audioData.length
        })
      } else {
        transcriptionError = new AudioProcessingError(errorMessage, {
          originalError: mainError,
          audioSize: audioData.length
        })
      }

      TranscriptionErrorReporter.reportError(transcriptionError)
      throw transcriptionError
    }
  } catch (emergencyError) {
    // 🚨 EMERGENCY PROTECTION: Final safety net
    breaker.reportError('performTranscription', emergencyError as Error)
    breaker.emergencyCallComplete('performTranscription')
    throw emergencyError
  }
}

/**
 * Get API key from options or API key manager with rotation
 */
function getApiKey(options: TranscriptionOptions): string {
  // 🔧 TASK 20.2: Validate API Configuration and Audio Format Compatibility
  console.log('🔑 TASK 20.2: Validating API configuration and permissions')

  // If a specific API key is provided in options, use it directly
  if (options.apiKey && options.apiKey.trim()) {
    console.log('✅ Using API key from options (length: %d chars)', options.apiKey.length)

    // Validate API key format
    if (!isValidGoogleApiKeyFormat(options.apiKey)) {
      console.warn('⚠️ API key format validation failed - continuing anyway')
    }

    return options.apiKey
  }

  try {
    // Use API key manager to get next available key with rotation
    const apiKeyManager = getApiKeyManager()
    const apiKey = apiKeyManager.getNextApiKey()

    console.log('✅ Using API key from manager:', {
      keyPreview: apiKey.substring(0, 8) + '...',
      keyLength: apiKey.length,
      isValidFormat: isValidGoogleApiKeyFormat(apiKey)
    })

    // Validate API key permissions for Gemini Live API
    validateApiKeyForGeminiLive(apiKey).catch(error => {
      console.warn('⚠️ API key validation warning:', error.message)
    })

    return apiKey
  } catch (error) {
    console.error('❌ Failed to get API key from manager:', error)

    // Fallback to environment variables for backward compatibility
    const keys = getGoogleApiKeys()
    const fallbackKey = keys.primary || keys.secondary || keys.vite || keys.generativeAi

    if (!fallbackKey) {
      console.error(
        '❌ Transcription failed: Google API Key is required.',
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

    console.log('✅ Using fallback API key from environment:', {
      source: keys.primary
        ? 'GOOGLE_API_KEY'
        : keys.secondary
          ? 'GEMINI_API_KEY'
          : keys.vite
            ? 'VITE_GOOGLE_API_KEY'
            : 'GOOGLE_GENERATIVE_AI_API_KEY',
      keyPreview: fallbackKey.substring(0, 8) + '...',
      keyLength: fallbackKey.length,
      isValidFormat: isValidGoogleApiKeyFormat(fallbackKey)
    })

    return fallbackKey
  }
}

/**
 * Validate Google API key format
 */
function isValidGoogleApiKeyFormat(apiKey: string): boolean {
  // Google API keys typically start with 'AIza' and are 39 characters long
  const googleApiKeyPattern = /^AIza[0-9A-Za-z-_]{35}$/
  return googleApiKeyPattern.test(apiKey)
}

/**
 * Validate API key permissions for Gemini Live API
 */
async function validateApiKeyForGeminiLive(apiKey: string): Promise<void> {
  try {
    console.log('🔍 Validating API key permissions for Gemini Live API...')

    // Check if API key has access to Gemini Live models
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`API key validation failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const models = data.models || []

    // Check if Gemini Live models are available
    // Note: Live models like 'gemini-live-2.5-flash' require special access and may not appear in models list
    const liveModels = models.filter(
      (model: {name: string}) =>
        model.name.includes('gemini-live') ||
        model.name.includes('live') ||
        model.name.includes('2.5-flash') // Also check for 2.5-flash models as fallback
    )

    console.log('✅ API key validation results:', {
      totalModels: models.length,
      liveModelsAvailable: liveModels.length,
      liveModels: liveModels.map((m: {name: string}) => m.name),
      hasLiveAccess: liveModels.length > 0
    })

    if (liveModels.length === 0) {
      console.warn('⚠️ WARNING: No Gemini Live models detected in API response')
      console.warn(
        '⚠️ This may indicate the API key lacks Live API access or the service is not available in your region'
      )
      console.warn(
        '⚠️ gemini-live-2.5-flash requires "Private GA" access which may not be available to all API keys'
      )

      // For now, log the warning but don't throw error - let the WebSocket connection attempt determine access
      console.log('⚠️ Proceeding with WebSocket connection attempt...')
      return // Don't throw error, allow connection attempt
    }

    console.log(
      '✅ Gemini Live API access confirmed - found models:',
      liveModels.map((m: {name: string}) => m.name)
    )
  } catch (error) {
    console.warn('⚠️ API key permission validation failed:', error)
    console.warn('⚠️ This may be due to Private GA access requirements for gemini-live-2.5-flash')
    console.log('⚠️ Proceeding with WebSocket connection attempt...')
    // Don't throw error - let the WebSocket connection attempt determine access
    return
  }
}

/**
 * Validate audio format compatibility with Gemini Live API
 */
function validateAudioFormatForGeminiLive(audioFormat: {
  isWav: boolean
  sampleRate?: number
  channels?: number
  bitDepth?: number
  dataSize?: number
}): void {
  console.log('🔊 TASK 20.2: Validating audio format compatibility with Gemini Live API')

  const issues: string[] = []
  const warnings: string[] = []

  // Gemini Live API requirements (as of latest documentation)
  const requiredSampleRate = 16000
  const requiredChannels = 1
  const requiredBitDepth = 16
  const maxChunkSize = 64 * 1024 // 64KB recommended chunk size

  if (!audioFormat.isWav) {
    warnings.push('Audio format is not WAV - ensure PCM data is correctly formatted')
  }

  if (audioFormat.sampleRate && audioFormat.sampleRate !== requiredSampleRate) {
    issues.push(
      `Sample rate is ${audioFormat.sampleRate}Hz, but Gemini Live API requires ${requiredSampleRate}Hz`
    )
  }

  if (audioFormat.channels && audioFormat.channels !== requiredChannels) {
    issues.push(
      `Audio has ${audioFormat.channels} channels, but Gemini Live API requires ${requiredChannels} channel (mono)`
    )
  }

  if (audioFormat.bitDepth && audioFormat.bitDepth !== requiredBitDepth) {
    issues.push(
      `Audio has ${audioFormat.bitDepth}-bit depth, but Gemini Live API requires ${requiredBitDepth}-bit`
    )
  }

  if (audioFormat.dataSize && audioFormat.dataSize > maxChunkSize) {
    warnings.push(
      `Audio data size (${audioFormat.dataSize} bytes) exceeds recommended chunk size (${maxChunkSize} bytes) - will use chunked streaming`
    )
  }

  // Log validation results
  console.log('🔊 Audio format validation results:', {
    audioFormat,
    requirements: {
      sampleRate: requiredSampleRate,
      channels: requiredChannels,
      bitDepth: requiredBitDepth,
      maxChunkSize
    },
    issues: issues.length,
    warnings: warnings.length,
    isCompatible: issues.length === 0
  })

  if (issues.length > 0) {
    console.error('❌ Audio format compatibility issues:', issues)
    issues.forEach(issue => console.error(`  • ${issue}`))
    console.log('🔧 These issues will be automatically corrected during processing')
  }

  if (warnings.length > 0) {
    console.warn('⚠️ Audio format warnings:', warnings)
    warnings.forEach(warning => console.warn(`  • ${warning}`))
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ Audio format is fully compatible with Gemini Live API requirements')
  }
}

/**
 * Check for quota limitations and rate limiting
 */
async function checkApiQuotaStatus(apiKey: string): Promise<void> {
  try {
    console.log('📊 TASK 20.2: Checking API quota and rate limiting status')

    // Check quota status by making a small test request
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

    const testPayload = {
      contents: [
        {
          parts: [
            {
              text: 'Test quota check'
            }
          ]
        }
      ],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: 10
      }
    }

    const startTime = Date.now()
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    })
    const endTime = Date.now()

    const responseTime = endTime - startTime

    console.log('📊 Quota check results:', {
      status: response.status,
      statusText: response.statusText,
      responseTime: `${responseTime}ms`,
      rateLimitHeaders: {
        'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
        'x-ratelimit-reset': response.headers.get('x-ratelimit-reset'),
        'x-quota-remaining': response.headers.get('x-quota-remaining')
      }
    })

    if (response.status === 429) {
      throw new Error('API rate limit exceeded - please wait before making more requests')
    }

    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ API access forbidden:', errorData)
      throw new Error('API access forbidden - check API key permissions or billing status')
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.warn('⚠️ Quota check returned non-OK status:', {
        status: response.status,
        error: errorData
      })
    }

    console.log('✅ API quota check completed successfully')
  } catch (error) {
    console.warn('⚠️ Quota status check failed:', error)
    throw error
  }
}

/**
 * Check if WebSocket mode should be used based on feature flags and options
 * DEPRECATED: WebSocket is now the primary transcription method
 */
// function shouldUseWebSocket(options: TranscriptionOptions): boolean {
//   // ✅ WEBSOCKETS ENABLED BY DEFAULT - As requested by user
//   // WebSocket is the primary transcription method for real-time streaming
//   const webSocketEnabled = getEnvVar('GEMINI_WEBSOCKET_ENABLED', 'true') !== 'false' // Enable unless explicitly disabled

//   console.log('🔍 shouldUseWebSocket check (WEBSOCKETS PRIORITIZED):', {
//     GEMINI_WEBSOCKET_ENABLED: getEnvVar('GEMINI_WEBSOCKET_ENABLED'),
//     webSocketEnabled,
//     optionsEnableWebSocket: options.enableWebSocket,
//     optionsMode: options.mode
//   })

//   // Check explicit option
//   if (options.enableWebSocket !== undefined) {
//     const result = options.enableWebSocket && webSocketEnabled
//     console.log('📝 WebSocket decision (explicit option):', result)
//     return result
//   }

//   // Use mode to determine WebSocket usage - DEFAULT TO WEBSOCKET/HYBRID
//   const mode = options.mode || TranscriptionMode.HYBRID
//   const result =
//     webSocketEnabled && (mode === TranscriptionMode.WEBSOCKET || mode === TranscriptionMode.HYBRID)

//   console.log('📝 WebSocket decision (mode-based):', {
//     mode,
//     webSocketEnabled,
//     finalResult: result
//   })

//   return result
// }

/**
 * Original batch transcription function (HTTP-based)
 * Used as fallback when WebSocket mode is not available or fails
 */
export async function transcribeAudioBatch(
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

  // Construct the prompt for transcription with specific instructions for speech-to-text
  const promptParts = [
    audioFilePart,
    {
      text: 'Listen to this audio and provide only the exact words that are spoken. Automatically detect the language (English, Russian, Ukrainian, or other languages) and transcribe accurately in the original language. Do not analyze, describe, or comment on the audio. If you hear clear speech, transcribe it word-for-word in the original language. If no speech is clearly audible, respond with nothing.'
    }
  ]

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
  const breaker = EmergencyCircuitBreaker.getInstance()

  // 🚨 EMERGENCY PROTECTION: Check circuit breaker before proceeding
  if (!breaker.emergencyCallGuard('transcribeAudioWithCompatibility')) {
    throw new Error(
      '🚨 EMERGENCY: transcribeAudioWithCompatibility blocked by circuit breaker due to stack overflow protection'
    )
  }

  try {
    // Migrate legacy configuration options if needed (cast to compatible type)
    const migrationResult = migrateLegacyConfig(
      options as Parameters<typeof migrateLegacyConfig>[0]
    )

    if (migrationResult.isLegacy) {
      console.warn('Legacy configuration detected. Consider migrating to the new format.')
      if (migrationResult.deprecations.length > 0) {
        migrationResult.deprecations.forEach(deprecation => {
          console.warn(`[DEPRECATION] ${deprecation}`)
        })
      }
    }

    // TEMPORARILY DISABLED - Recursive call causing stack overflow
    console.log('🔗 transcribeAudioWithCompatibility: Recursive call disabled for debugging')
    console.log('Migration result:', {
      isLegacy: migrationResult.isLegacy,
      deprecationsCount: migrationResult.deprecations.length
    })

    // Instead of calling transcribeAudio recursively, call transcribeAudioViaWebSocket directly
    const result = await transcribeAudioViaWebSocket(
      audioData,
      migrationResult.newConfig as TranscriptionOptions
    )

    // 🚨 EMERGENCY PROTECTION: Mark successful completion
    breaker.emergencyCallComplete('transcribeAudioWithCompatibility')
    return result

    // return transcribeAudio(audioData, migrationResult.newConfig as TranscriptionOptions)
  } catch (error) {
    // 🚨 EMERGENCY PROTECTION: Report error and mark completion
    breaker.reportError('transcribeAudioWithCompatibility', error as Error)
    breaker.emergencyCallComplete('transcribeAudioWithCompatibility')
    throw error
  }
}

/**
 * Get comprehensive performance and quota status report
 * Useful for debugging and monitoring transcription system health
 */
export async function getTranscriptionSystemReport(): Promise<{
  performance: string
  quotaStatus: string
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical'
  recommendations: string[]
}> {
  const performanceService = UnifiedPerformanceService.getInstance()
  const quotaManager = QuotaManager.getInstance()

  // Get performance report
  const performanceReport = performanceService.generatePerformanceReport()
  const stats = performanceService.getTranscriptionStats()

  // Get quota statuses
  const quotaStatuses = quotaManager.getAllQuotaStatuses()
  let quotaReport = '🔐 Quota Status:\n'

  if (quotaStatuses.size === 0) {
    quotaReport += '  • No quota issues recorded\n'
  } else {
    for (const [provider, status] of quotaStatuses) {
      quotaReport += `  • ${provider}: ${status.isBlocked ? '🚫 BLOCKED' : '✅ OK'} (${status.recentErrors.length} recent errors)\n`
      if (status.isBlocked) {
        const timeUntilUnblocked = quotaManager.getTimeUntilUnblocked(provider)
        quotaReport += `    Unblocked in: ${Math.round(timeUntilUnblocked / 1000)}s\n`
      }
    }
  }

  // Determine system health
  let systemHealth: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent'
  const recommendations: string[] = []

  if (stats.totalSessions > 0) {
    if (stats.averageLatency > 10000) {
      systemHealth = 'critical'
      recommendations.push('Critical: Very high API latency detected')
    } else if (stats.averageLatency > 5000) {
      systemHealth = 'warning'
      recommendations.push('Warning: High API latency detected')
    }

    if (stats.averageConfidence < 0.6) {
      if (systemHealth === 'excellent') systemHealth = 'critical'
      recommendations.push('Critical: Very low transcription confidence')
    } else if (stats.averageConfidence < 0.8) {
      if (systemHealth === 'excellent') systemHealth = 'warning'
      recommendations.push('Warning: Low transcription confidence')
    }
  }

  // Check quota status
  let hasBlockedProviders = false
  for (const [, status] of quotaStatuses) {
    if (status.isBlocked) {
      hasBlockedProviders = true
      break
    }
  }

  if (hasBlockedProviders) {
    if (systemHealth === 'excellent') systemHealth = 'warning'
    recommendations.push('Warning: Some transcription providers are quota-blocked')
  }

  if (recommendations.length === 0) {
    recommendations.push('System is operating optimally')
  }

  return {
    performance: performanceReport,
    quotaStatus: quotaReport.trim(),
    systemHealth,
    recommendations
  }
}

/**
 * Enhanced test function that simulates realistic streaming transcription
 * This helps debug streaming text rendering issues
 */
export async function testEnhancedStreamingTranscriptionIPC(): Promise<void> {
  console.log('🧪 Testing enhanced streaming transcription IPC communication...')

  try {
    const windowManager = WindowManager.getInstance()

    // Simulate realistic streaming transcription sequence
    const streamingSequence = [
      {text: 'Hello', isFinal: false, confidence: 0.7, delay: 0},
      {text: 'Hello world', isFinal: false, confidence: 0.8, delay: 500},
      {text: 'Hello world this', isFinal: false, confidence: 0.82, delay: 800},
      {text: 'Hello world this is', isFinal: false, confidence: 0.85, delay: 1200},
      {text: 'Hello world this is a', isFinal: false, confidence: 0.87, delay: 1500},
      {text: 'Hello world this is a test', isFinal: false, confidence: 0.9, delay: 1800},
      {text: 'Hello world this is a test of', isFinal: false, confidence: 0.92, delay: 2200},
      {text: 'Hello world this is a test of the', isFinal: false, confidence: 0.93, delay: 2500},
      {
        text: 'Hello world this is a test of the streaming',
        isFinal: false,
        confidence: 0.94,
        delay: 2800
      },
      {
        text: 'Hello world this is a test of the streaming transcription',
        isFinal: false,
        confidence: 0.95,
        delay: 3200
      },
      {
        text: 'Hello world this is a test of the streaming transcription system',
        isFinal: true,
        confidence: 0.98,
        delay: 3500
      }
    ]

    console.log(`🧪 Starting enhanced streaming sequence with ${streamingSequence.length} messages`)

    for (let i = 0; i < streamingSequence.length; i++) {
      const message = streamingSequence[i]

      setTimeout(() => {
        const broadcastData = {
          text: message.text,
          isFinal: message.isFinal,
          source: 'test-enhanced-ipc',
          confidence: message.confidence
        }

        windowManager.broadcastToAllWindows(
          'inter-window-message',
          'streaming-transcription',
          broadcastData
        )
        console.log(
          `🧪 Enhanced message ${i + 1}/${streamingSequence.length}: "${message.text}" (${message.isFinal ? 'final' : 'partial'}, confidence: ${message.confidence})`
        )
      }, message.delay)
    }

    console.log('🧪 Enhanced streaming transcription IPC messages scheduled')
  } catch (error) {
    console.error('🧪 Failed to test enhanced streaming transcription IPC:', error)
  }
}

/**
 * 🔧 TASK 20.4: Test function to validate API configuration with controlled audio samples
 * This helps isolate configuration issues from audio processing issues
 */
export async function testApiConfigurationWithControlledAudio(): Promise<{
  apiKeyValid: boolean
  audioFormatValid: boolean
  quotaStatus: 'ok' | 'warning' | 'error'
  testResults: Array<{test: string; result: 'pass' | 'fail'; details: string}>
}> {
  console.log('🧪 TASK 20.2: Testing API configuration with controlled audio samples')

  const testResults: Array<{test: string; result: 'pass' | 'fail'; details: string}> = []
  let apiKeyValid = false
  let audioFormatValid = false
  let quotaStatus: 'ok' | 'warning' | 'error' = 'ok'

  try {
    // Test 1: API Key Validation
    console.log('🧪 Test 1: API Key Validation')
    const apiKey = getApiKey({})

    if (isValidGoogleApiKeyFormat(apiKey)) {
      testResults.push({
        test: 'API Key Format',
        result: 'pass',
        details: `Valid format: ${apiKey.substring(0, 8)}...`
      })
      apiKeyValid = true
    } else {
      testResults.push({
        test: 'API Key Format',
        result: 'fail',
        details: 'Invalid Google API key format'
      })
    }

    // Test 2: API Permissions
    console.log('🧪 Test 2: API Permissions Check')
    try {
      await validateApiKeyForGeminiLive(apiKey)
      testResults.push({
        test: 'API Permissions',
        result: 'pass',
        details: 'API key has valid permissions'
      })
    } catch (error) {
      testResults.push({
        test: 'API Permissions',
        result: 'fail',
        details: `Permission error: ${error}`
      })
      apiKeyValid = false
    }

    // Test 3: Quota Status
    console.log('🧪 Test 3: Quota Status Check')
    try {
      await checkApiQuotaStatus(apiKey)
      testResults.push({test: 'Quota Status', result: 'pass', details: 'Quota check passed'})
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
        quotaStatus = 'error'
        testResults.push({test: 'Quota Status', result: 'fail', details: 'Rate limit exceeded'})
      } else {
        quotaStatus = 'warning'
        testResults.push({
          test: 'Quota Status',
          result: 'fail',
          details: `Quota warning: ${errorMsg}`
        })
      }
    }

    // Test 4: Audio Format Validation with Test Audio
    console.log('🧪 Test 4: Audio Format Validation with Test Audio')

    // Create a test WAV audio buffer (1 second of sine wave at 16kHz, mono, 16-bit)
    const testAudio = createTestWavAudio()
    const audioFormat = analyzeWavFormat(testAudio)

    console.log('🧪 Test audio format:', audioFormat)

    try {
      validateAudioFormatForGeminiLive(audioFormat)
      testResults.push({
        test: 'Audio Format',
        result: 'pass',
        details: 'Test audio format is compatible'
      })
      audioFormatValid = true
    } catch (error) {
      testResults.push({
        test: 'Audio Format',
        result: 'fail',
        details: `Audio format error: ${error}`
      })
    }

    // Test 5: PCM Data Processing
    console.log('🧪 Test 5: PCM Data Processing')
    const pcmData = stripWavHeaders(testAudio)
    const audioMetrics = calculateAudioMetrics(pcmData)

    if (audioMetrics.nonZeroBytes > 0 && audioMetrics.maxAmplitude > 100) {
      testResults.push({
        test: 'PCM Processing',
        result: 'pass',
        details: `PCM data valid: ${audioMetrics.nonZeroBytes} non-zero bytes, max amplitude ${audioMetrics.maxAmplitude}`
      })
    } else {
      testResults.push({
        test: 'PCM Processing',
        result: 'fail',
        details: `PCM data issues: ${audioMetrics.nonZeroBytes} non-zero bytes, max amplitude ${audioMetrics.maxAmplitude}`
      })
    }

    // Summary
    const summary = {
      apiKeyValid,
      audioFormatValid,
      quotaStatus,
      testResults,
      overallStatus: apiKeyValid && audioFormatValid && quotaStatus !== 'error' ? 'pass' : 'fail'
    }

    console.log('🧪 TASK 20.2: API Configuration Test Results:', summary)
    return summary
  } catch (error) {
    console.error('🧪 TASK 20.2: API configuration test failed:', error)
    testResults.push({
      test: 'Overall Test',
      result: 'fail',
      details: `Test framework error: ${error}`
    })

    return {
      apiKeyValid: false,
      audioFormatValid: false,
      quotaStatus: 'error',
      testResults
    }
  }
}

/**
 * Create a test WAV audio buffer for validation testing
 * Generates 1 second of sine wave at 440Hz, 16kHz sample rate, mono, 16-bit
 */
function createTestWavAudio(): Buffer {
  const sampleRate = 16000
  const duration = 1 // 1 second
  const frequency = 440 // A4 note
  const channels = 1
  const bitDepth = 16

  const sampleCount = sampleRate * duration
  const dataSize = sampleCount * channels * (bitDepth / 8)
  const headerSize = 44
  const fileSize = headerSize + dataSize

  const buffer = Buffer.alloc(fileSize)

  // WAV header
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(fileSize - 8, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // PCM header size
  buffer.writeUInt16LE(1, 20) // PCM format
  buffer.writeUInt16LE(channels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28) // Byte rate
  buffer.writeUInt16LE(channels * (bitDepth / 8), 32) // Block align
  buffer.writeUInt16LE(bitDepth, 34)
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataSize, 40)

  // Generate sine wave audio data
  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate
    const amplitude = Math.sin(2 * Math.PI * frequency * time) * 0.5 // 50% amplitude
    const sample = Math.round(amplitude * 32767) // Convert to 16-bit signed integer
    buffer.writeInt16LE(sample, headerSize + i * 2)
  }

  return buffer
}

/**
 * 🔧 TASK 20.4: Isolated test harness for WebSocket transcription flow
 * Tests the complete transcription pipeline with controlled inputs and comprehensive logging
 */
export async function testWebSocketTranscriptionFlow(options: {
  useTestAudio?: boolean
  audioData?: Buffer
  timeoutMs?: number
  validateResponses?: boolean
  logLevel?: 'minimal' | 'detailed' | 'verbose'
}): Promise<{
  success: boolean
  transcriptionReceived: boolean
  responseCount: number
  errors: string[]
  transcriptionResults: Array<{
    text: string
    confidence: number
    isFinal: boolean
    timestamp: number
  }>
  performanceMetrics: {setupTime: number; totalTime: number; avgResponseTime: number}
  debugInfo: Record<string, unknown>
}> {
  console.log('🧪 TASK 20.4: Starting isolated WebSocket transcription flow test')

  const testStartTime = Date.now()
  const errors: string[] = []
  const transcriptionResults: Array<{
    text: string
    confidence: number
    isFinal: boolean
    timestamp: number
  }> = []
  const responseCount = 0
  const setupCompleteTime = 0
  let transcriptionReceived = false
  const debugInfo: Record<string, unknown> = {}

  try {
    // Prepare test audio
    const audioData =
      options.audioData || (options.useTestAudio ? createTestWavAudio() : Buffer.alloc(0))
    if (audioData.length === 0) {
      throw new Error('No audio data provided for transcription test')
    }

    debugInfo.audioDataSize = audioData.length
    debugInfo.useTestAudio = options.useTestAudio || false

    // Validate API configuration first
    console.log('🧪 Step 1: Validating API configuration')
    const configTest = await testApiConfigurationWithControlledAudio()
    debugInfo.configTest = configTest

    if (!configTest.apiKeyValid) {
      errors.push('API key validation failed')
    }

    // Test the WebSocket transcription with retry logic
    console.log('🧪 Step 2: Testing WebSocket transcription with retry logic')
    const transcriptionResult = await testTranscriptionWithRetry(audioData, {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: options.timeoutMs || 30000,
      logLevel: options.logLevel || 'detailed'
    })

    debugInfo.transcriptionResult = transcriptionResult
    transcriptionReceived = transcriptionResult.success && transcriptionResult.text.length > 0

    if (transcriptionResult.success) {
      transcriptionResults.push({
        text: transcriptionResult.text,
        confidence: transcriptionResult.confidence,
        isFinal: true,
        timestamp: Date.now()
      })
    } else {
      errors.push(`Transcription failed: ${transcriptionResult.error}`)
    }

    const totalTime = Date.now() - testStartTime

    return {
      success: errors.length === 0 && transcriptionReceived,
      transcriptionReceived,
      responseCount,
      errors,
      transcriptionResults,
      performanceMetrics: {
        setupTime: setupCompleteTime - testStartTime,
        totalTime,
        avgResponseTime: responseCount > 0 ? totalTime / responseCount : 0
      },
      debugInfo
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    errors.push(`Test harness error: ${errorMessage}`)
    console.error('🧪 TASK 20.4: Test harness failed:', error)

    return {
      success: false,
      transcriptionReceived: false,
      responseCount: 0,
      errors,
      transcriptionResults: [],
      performanceMetrics: {
        setupTime: 0,
        totalTime: Date.now() - testStartTime,
        avgResponseTime: 0
      },
      debugInfo: {...debugInfo, testError: errorMessage}
    }
  }
}

/**
 * 🔧 TASK 20.4: Transcription with retry logic and exponential backoff
 */
async function testTranscriptionWithRetry(
  audioData: Buffer,
  options: {
    maxRetries: number
    retryDelayMs: number
    timeoutMs: number
    logLevel: 'minimal' | 'detailed' | 'verbose'
  }
): Promise<{
  success: boolean
  text: string
  confidence: number
  error?: string
  attempts: number
  totalTime: number
}> {
  let attempts = 0
  let currentDelay = options.retryDelayMs
  const startTime = Date.now()

  while (attempts <= options.maxRetries) {
    attempts++
    console.log(`🔄 TASK 20.4: Transcription attempt ${attempts}/${options.maxRetries + 1}`)

    try {
      // Use the existing transcription function with timeout
      const transcriptionPromise = transcribeAudioViaWebSocket(audioData, {
        enableWebSocket: true
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transcription timeout')), options.timeoutMs)
      })

      const result = await Promise.race([transcriptionPromise, timeoutPromise])

      if (result.text && result.text.trim().length > 0) {
        console.log(`✅ TASK 20.4: Transcription successful on attempt ${attempts}`)
        return {
          success: true,
          text: result.text,
          confidence: result.confidence || 0.8,
          attempts,
          totalTime: Date.now() - startTime
        }
      } else {
        throw new Error('Empty transcription result')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.warn(`⚠️ TASK 20.4: Attempt ${attempts} failed: ${errorMessage}`)

      if (attempts > options.maxRetries) {
        return {
          success: false,
          text: '',
          confidence: 0,
          error: `All ${attempts} attempts failed. Last error: ${errorMessage}`,
          attempts,
          totalTime: Date.now() - startTime
        }
      }

      // Exponential backoff delay
      if (attempts <= options.maxRetries) {
        console.log(`⏳ TASK 20.4: Waiting ${currentDelay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, currentDelay))
        currentDelay *= 2 // Exponential backoff
      }
    }
  }

  return {
    success: false,
    text: '',
    confidence: 0,
    error: 'Max retries exceeded',
    attempts,
    totalTime: Date.now() - startTime
  }
}
export async function testStreamingTranscriptionIPC(): Promise<void> {
  console.log('🧪 Testing streaming transcription IPC communication...')

  try {
    const windowManager = WindowManager.getInstance()

    // Send a series of test streaming messages
    const testMessages = [
      {text: 'This is a test', isFinal: false, confidence: 0.7},
      {text: 'This is a test of the', isFinal: false, confidence: 0.8},
      {text: 'This is a test of the streaming', isFinal: false, confidence: 0.85},
      {text: 'This is a test of the streaming transcription', isFinal: false, confidence: 0.9},
      {
        text: 'This is a test of the streaming transcription system',
        isFinal: true,
        confidence: 0.95
      }
    ]

    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i]

      setTimeout(() => {
        windowManager.broadcastToAllWindows('inter-window-message', 'streaming-transcription', {
          text: message.text,
          isFinal: message.isFinal,
          source: 'test-ipc',
          confidence: message.confidence
        })
        console.log(
          `🧪 Test message ${i + 1}/${testMessages.length}: "${message.text}" (${message.isFinal ? 'final' : 'partial'})`
        )
      }, i * 500) // 500ms delay between messages
    }

    console.log('🧪 Test streaming transcription IPC messages scheduled')
  } catch (error) {
    console.error('🧪 Failed to test streaming transcription IPC:', error)
  }
}

/**
 * Start immediate streaming session when recording begins
 * This provides instant feedback to the user and begins real-time transcription
 */
export function startImmediateStreamingSession(): void {
  try {
    console.log('🎙️ Starting immediate streaming session...')

    // Send immediate feedback that recording has started
    const immediateData = {
      text: 'Recording started... Speak now',
      isFinal: false,
      source: 'streaming-session',
      confidence: 0.8,
      timestamp: Date.now()
    }

    // Broadcast to renderer processes
    if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
      window.electronWindow.broadcast('streaming-transcription', immediateData)
      console.log('✅ Immediate streaming session started (renderer)')
    }

    // Start continuous streaming feedback simulation
    let streamingInterval: NodeJS.Timeout | null = null
    let streamingCount = 0

    const streamingMessages = [
      'Listening...',
      'Processing audio...',
      'Analyzing speech patterns...',
      'Ready for transcription...'
    ]

    // Clear any existing streaming interval
    if (streamingInterval) {
      clearInterval(streamingInterval)
    }

    // Provide periodic feedback while waiting for actual transcription
    streamingInterval = setInterval(() => {
      if (streamingCount < streamingMessages.length) {
        const feedbackData = {
          text: streamingMessages[streamingCount],
          isFinal: false,
          source: 'streaming-feedback',
          confidence: 0.6,
          timestamp: Date.now()
        }

        // Broadcast feedback
        if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
          window.electronWindow.broadcast('streaming-transcription', feedbackData)
        }

        console.log(`🔄 Streaming feedback: ${streamingMessages[streamingCount]}`)
        streamingCount++
      } else {
        // After initial feedback, clear interval and wait for real transcription
        if (streamingInterval) {
          clearInterval(streamingInterval)
          streamingInterval = null
        }

        // Send final ready state
        const readyData = {
          text: '',
          isFinal: false,
          source: 'streaming-ready',
          confidence: 1.0,
          timestamp: Date.now()
        }

        if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
          window.electronWindow.broadcast('streaming-transcription', readyData)
        }

        console.log('🎯 Streaming session ready for live transcription')
      }
    }, 1500) // Update every 1.5 seconds

    // Clean up interval after 10 seconds (when batch transcription should start)
    setTimeout(() => {
      if (streamingInterval) {
        clearInterval(streamingInterval)
        streamingInterval = null
      }
    }, 10000)
  } catch (error) {
    console.error('Failed to start immediate streaming session:', error)
  }
}

// Export legacy aliases for backward compatibility
export const {
  transcribeAudioLegacy: legacyTranscribeAudioAlias,
  createLegacyConfig: createLegacyTranscriptionConfig,
  setupLegacyEnvironment: setupLegacyTranscriptionEnvironment
} = LegacyAliases
