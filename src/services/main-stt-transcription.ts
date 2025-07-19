import {GoogleGenAI} from '@google/genai'
import {TranscriptionMode} from './gemini-live-integration'
import {
  createLegacyWrapper,
  migrateLegacyConfig,
  LegacyAliases
} from './transcription-compatibility'
import {QuotaManager} from './quota-manager'
import {UnifiedPerformanceService} from './unified-performance'

// Live API model for WebSocket (recommended half-cascade model)
const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-live-2.5-flash-preview'

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
  // Start performance tracking
  const performanceService = UnifiedPerformanceService.getInstance()
  const session = performanceService.startTranscriptionSession()
  const audioProcessingStart = Date.now()

  // Check if WebSocket mode should be used
  if (shouldUseWebSocket(options)) {
    try {
      console.log('🚀 Starting WebSocket transcription attempt')
      // For main process, we have audio data already - process it directly via WebSocket
      const result = await transcribeAudioViaWebSocket(audioData, options)
      
      // Record performance metrics
      const audioProcessingTime = Date.now() - audioProcessingStart
      performanceService.recordTranscriptionMetrics(
        session.sessionId,
        session,
        audioProcessingTime,
        result.duration,
        {
          text: result.text,
          confidence: result.confidence,
          source: result.source || 'websocket'
        },
        {
          totalAudioBytes: audioData.length,
          bufferChunks: Math.ceil(audioData.length / (32 * 1024)) // Estimate chunks
        }
      )
      
      return result
    } catch (error) {
      console.warn('🔥 WebSocket transcription failed, falling back to batch mode:', error)
      console.log('🔥 Error details:', error)
      console.log('🔥 Proceeding with batch transcription fallback')
      // Fall through to batch mode
    }
  }

  // Fallback to original batch mode
  console.log('🚀 Starting batch transcription (fallback or direct)')
  const result = await transcribeAudioBatch(audioData, options)
  
  // Record performance metrics for batch mode
  const audioProcessingTime = Date.now() - audioProcessingStart
  performanceService.recordTranscriptionMetrics(
    session.sessionId,
    session,
    audioProcessingTime,
    result.duration,
    {
      text: result.text,
      confidence: result.confidence,
      source: result.source || 'batch'
    },
    {
      totalAudioBytes: audioData.length,
      bufferChunks: 1 // Batch mode uses single chunk
    }
  )
  
  return result
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
    return { totalBytes: 0, nonZeroBytes: 0, maxAmplitude: 0, avgAmplitude: 0, isSilent: true }
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
  const isSilent = nonZeroBytes === 0 || maxAmplitude < 100
  
  return { totalBytes: pcmData.length, nonZeroBytes, maxAmplitude, avgAmplitude, isSilent }
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
    { start: 0, size: Math.min(sampleSize, totalBytes) },
    { start: Math.max(0, Math.floor(totalBytes / 2) - sampleSize / 2), size: sampleSize },
    { start: Math.max(0, totalBytes - sampleSize), size: sampleSize }
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
  const samplingRatio = totalSamples > 0 ? (totalBytes / 2) / totalSamples : 0
  const estimatedNonZeroBytes = nonZeroSamples * 2 * samplingRatio
  const avgAmplitude = totalSamples > 0 ? amplitudeSum / totalSamples : 0
  const isSilent = estimatedNonZeroBytes === 0 || maxAmplitude < 100
  
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

  try {
    // Check for recent quota errors using QuotaManager
    const quotaManager = QuotaManager.getInstance()
    const WEBSOCKET_PROVIDER = 'gemini-websocket'
    
    if (quotaManager.shouldBlockProvider(WEBSOCKET_PROVIDER)) {
      const timeUntilUnblocked = quotaManager.getTimeUntilUnblocked(WEBSOCKET_PROVIDER)
      console.log(
        `🚫 Skipping WebSocket transcription due to recent quota errors. Unblocked in ${Math.round(timeUntilUnblocked / 1000)}s`
      )
      throw new Error('Quota limit exceeded - using batch fallback')
    }

    // Import WebSocket client directly
    const {default: GeminiLiveWebSocketClient, ResponseModality} = await import(
      './gemini-live-websocket'
    )

    const client = new GeminiLiveWebSocketClient({
      apiKey,
      model: options.modelName || DEFAULT_GEMINI_LIVE_MODEL, // Use Live API model for WebSocket
      responseModalities: [ResponseModality.TEXT], // Optimize for text transcription
      systemInstruction:
        'You are a speech-to-text transcription system. Listen to the audio input and provide an accurate transcription of the spoken words. Only return the transcribed text, no additional commentary.',
      connectionTimeout: 15000, // Increased timeout for better reliability
      maxQueueSize: 50, // Optimized queue size for transcription
      apiVersion: process.env.GEMINI_API_VERSION || 'v1beta', // Use configured API version or default to v1beta
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: 2048,
        temperature: 0.0,
        topP: 1.0
      }
    })

    try {
      // Connect to WebSocket
      await client.connect()

      // CRITICAL: Wait for setup completion before sending audio
      // This ensures the Gemini Live API is ready to receive audio data
      if (!client.isSetupCompleted()) {
        console.log('Waiting for WebSocket setup completion before sending audio')
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for WebSocket setup completion'))
          }, 15000)

          const onSetupComplete = () => {
            clearTimeout(timeout)
            client.off('setupComplete', onSetupComplete)
            client.off('error', onSetupError)
            console.log('WebSocket setup completed - ready to send audio')
            resolve()
          }

          const onSetupError = (error: unknown) => {
            clearTimeout(timeout)
            client.off('setupComplete', onSetupComplete)
            client.off('error', onSetupError)
            reject(error)
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

      let pcmData = stripWavHeaders(audioData)
      console.log(`Original audio: ${audioData.length} bytes, PCM data: ${pcmData.length} bytes`)

      // Debug: Check if audio contains any actual content
      const sampleView = pcmData.slice(0, Math.min(100, pcmData.length))
      const nonZeroSamples = sampleView.filter(byte => byte !== 0).length
      console.log(
        `Audio content check: ${nonZeroSamples}/${sampleView.length} non-zero bytes in first 100 bytes`
      )

      // Optimized audio metrics calculation with strategic sampling
      const audioMetrics = calculateAudioMetrics(pcmData)

      // Early silence detection with optimized metrics calculation
      const isSilent = audioMetrics.isSilent
      if (isSilent) {
        console.warn('⚠️ WARNING: Audio appears to be silent or very quiet - returning early to save resources')
        // Return early result for silent audio to avoid expensive WebSocket processing
        return {
          text: '[Silent audio detected]',
          duration: Date.now() - startTime,
          source: 'websocket' as const,
          confidence: 0.1
        }
      }

      console.log(`Audio metrics: ${audioMetrics.nonZeroBytes}/${audioMetrics.totalBytes} non-zero bytes, max amplitude: ${audioMetrics.maxAmplitude}, avg: ${audioMetrics.avgAmplitude.toFixed(1)}`)

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
        console.log(`Streaming audio data in ${totalChunks} chunks of up to ${maxChunkSize} bytes each`)

        // Send audio chunks sequentially with optimized streaming
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          const startPos = chunkIndex * maxChunkSize
          const endPos = Math.min(startPos + maxChunkSize, pcmData.length)
          const chunk = pcmData.subarray(startPos, endPos)
          const base64Audio = chunk.toString('base64')

          console.log(`Streaming chunk ${chunkIndex + 1}/${totalChunks}: ${chunk.length} bytes`)

          await client.sendRealtimeInput({
            audio: {
              data: base64Audio,
              mimeType: 'audio/pcm;rate=16000' // Fixed MIME type per API requirements
            }
          })

          // Optimized delay for streaming - shorter for better responsiveness
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        console.log(`Finished streaming all ${totalChunks} audio chunks efficiently`)

        // Mark that audio has been sent so we can process responses appropriately
        audioSent = true

        // For live streaming, don't send audioStreamEnd - keep connection open
        console.log('Audio streaming completed - keeping connection open for live responses')

        // Reduced wait time for better responsiveness
        console.log('Waiting for live streaming responses...')
        await new Promise(resolve => setTimeout(resolve, 500))
      } else {
        // For smaller audio chunks, send as single stream
        const base64Audio = pcmData.toString('base64')
        console.log(`Streaming audio data: ${pcmData.length} bytes`)

        await client.sendRealtimeInput({
          audio: {
            data: base64Audio,
            mimeType: 'audio/pcm;rate=16000'
          }
        })

        // Mark that audio has been sent
        audioSent = true

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

      // Handle streaming responses with optimized processing
      client.on(
        'geminiResponse',
        async (response: {
          type?: string
          content?: string
          metadata?: {confidence?: number; isPartial?: boolean}
        }) => {
          // Early return for non-text responses to reduce processing overhead
          if (!audioSent || response.type !== 'text' || !response.content?.trim()) {
            return
          }

          const text = response.content.trim()
          const confidence = response.metadata?.confidence || 0.8
          const isFinal = !response.metadata?.isPartial
          const now = Date.now()

          // Handle final transcriptions immediately
          if (isFinal) {
            // Clear any pending partial update
            if (pendingPartialTimeout) {
              clearTimeout(pendingPartialTimeout)
              pendingPartialTimeout = null
            }
            
            await streamTranscriptionToWindows(text, true, confidence)
          } else {
            // Throttle partial updates to prevent UI flooding
            pendingPartialText = text
            
            if (now - lastPartialUpdate >= PARTIAL_UPDATE_THROTTLE_MS) {
              lastPartialUpdate = now
              await streamTranscriptionToWindows(text, false, confidence)
            } else if (!pendingPartialTimeout) {
              // Schedule delayed update if not already scheduled
              pendingPartialTimeout = setTimeout(async () => {
                pendingPartialTimeout = null
                lastPartialUpdate = Date.now()
                await streamTranscriptionToWindows(pendingPartialText, false, confidence)
              }, PARTIAL_UPDATE_THROTTLE_MS - (now - lastPartialUpdate))
            }
          }
        }
      )

      // Optimized streaming function to reduce code duplication
      async function streamTranscriptionToWindows(text: string, isFinal: boolean, confidence: number) {
        try {
          const WindowManager = (await import('../services/window-manager')).default
          const windowManager = WindowManager.getInstance()
          
          // Batch the broadcast data to reduce object creation overhead
          const broadcastData = {
            text,
            isFinal,
            source: 'websocket',
            confidence
          }
          
          windowManager.broadcastToAllWindows('inter-window-message', 'streaming-transcription', broadcastData)
        } catch (streamingError) {
          console.warn('Failed to stream transcription:', streamingError)
        }
      }

      // Auto-disconnect after a reasonable time for live streaming
      setTimeout(async () => {
        try {
          console.log('🔌 Auto-disconnecting WebSocket after streaming period')
          await client.disconnect()
        } catch (error) {
          console.warn('Error auto-disconnecting:', error)
        }
      }, 10000) // 10 seconds max for live streaming

      // Return immediately for live streaming - don't wait
      console.log('🚀 Live streaming enabled - returning immediately')
      return {
        text: 'Live streaming session established',
        duration: Date.now() - startTime,
        source: 'websocket' as const
      }
    } catch (error) {
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
        await client.disconnect()
      } catch (disconnectError) {
        console.warn('Error disconnecting WebSocket client during error cleanup:', disconnectError)
      }
      throw error
    }
  } catch (mainError) {
    // Main function error handling - fallback to batch transcription
    console.error('🚫 WebSocket transcription failed, falling back to batch mode:', mainError)

    // Import proxy transcription module as fallback
    const {transcribeAudioViaProxy} = await import('./proxy-stt-transcription')

    // Use proxy transcription as fallback
    return await transcribeAudioViaProxy(audioData, {
      ...options,
      mode: TranscriptionMode.BATCH // Force batch mode for fallback
    })
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
 * Test function to manually trigger streaming transcription IPC events
 * This bypasses Gemini and directly sends test streaming data to verify IPC communication
 */
export async function testStreamingTranscriptionIPC(): Promise<void> {
  console.log('🧪 Testing streaming transcription IPC communication...')
  
  try {
    const WindowManager = (await import('../services/window-manager')).default
    const windowManager = WindowManager.getInstance()
    
    // Send a series of test streaming messages
    const testMessages = [
      { text: 'This is a test', isFinal: false, confidence: 0.7 },
      { text: 'This is a test of the', isFinal: false, confidence: 0.8 },
      { text: 'This is a test of the streaming', isFinal: false, confidence: 0.85 },
      { text: 'This is a test of the streaming transcription', isFinal: false, confidence: 0.9 },
      { text: 'This is a test of the streaming transcription system', isFinal: true, confidence: 0.95 }
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
        console.log(`🧪 Test message ${i + 1}/${testMessages.length}: "${message.text}" (${message.isFinal ? 'final' : 'partial'})`)
      }, i * 500) // 500ms delay between messages
    }
    
    console.log('🧪 Test streaming transcription IPC messages scheduled')
  } catch (error) {
    console.error('🧪 Failed to test streaming transcription IPC:', error)
  }
}

// Export legacy aliases for backward compatibility
export const {
  transcribeAudioLegacy: legacyTranscribeAudioAlias,
  createLegacyConfig: createLegacyTranscriptionConfig,
  setupLegacyEnvironment: setupLegacyTranscriptionEnvironment
} = LegacyAliases
