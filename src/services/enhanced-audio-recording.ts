/**
 * Enhanced Audio Recording Service with Real-Time Streaming Support
 *
 * Builds upon the existing audio-recording.ts to add real-time WebSocket streaming capabilities
 * while maintaining backward compatibility with interval-based recording.
 */

import {Subject, Subscription, interval, BehaviorSubject} from 'rxjs'
import {takeUntil} from 'rxjs/operators'
import {getAudioCapture, type AudioChunkData} from './audio-capture-factory'
import {getTranscriptionStateManager} from '../state/TranscriptionStateManager'
import {EmergencyCircuitBreaker} from '../utils/EmergencyCircuitBreaker'
import {
  RealTimeAudioStreamingService,
  createRealTimeAudioStreaming,
  type StreamingMetrics
} from './real-time-audio-streaming'
import {GeminiLiveIntegrationService} from './gemini-live-integration'
import {sanitizeLogMessage} from './log-sanitizer'

// Define types to avoid potential import issues
export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  timestamp?: number
  source?: string
}

export interface RecordingState {
  isRecording: boolean
  isTranscribing: boolean
  recordingTime: number
  status: string
}

// Re-export functions from audio-recording (using dynamic imports when needed)
export {
  INTERVAL_SECONDS,
  TARGET_SAMPLE_RATE,
  DEVICE_SAMPLE_RATE,
  resampleAudio,
  renderAudioToWav
} from './audio-recording'

// Enhanced recording modes
export enum RecordingMode {
  INTERVAL = 'interval', // Traditional interval-based recording
  REALTIME = 'realtime', // Real-time WebSocket streaming
  HYBRID = 'hybrid' // Combination of both
}

// Enhanced configuration options
export interface AudioRecordingConfig {
  mode: RecordingMode
  intervalSeconds?: number
  enableRealTimeStreaming?: boolean
  bufferSize?: number
  adaptiveBuffering?: boolean
  qualityThreshold?: number
}

// Default configuration
export const DEFAULT_RECORDING_CONFIG: AudioRecordingConfig = {
  mode: RecordingMode.REALTIME, // ✅ WEBSOCKET-ONLY MODE - No hybrid or interval fallback
  intervalSeconds: 3,
  enableRealTimeStreaming: true, // Always enable WebSocket streaming
  // 🔧 CRITICAL FIX: Increase buffer size to generate 500ms chunks for Gemini Live API
  // Calculation: 500ms * 16000 samples/sec = 8000 samples
  bufferSize: 8000, // Generate 500ms audio chunks (was 4096)
  adaptiveBuffering: true,
  qualityThreshold: 0.8
}

// Enhanced state interface
export interface EnhancedRecordingState {
  isRecording: boolean
  isTranscribing: boolean
  isStreaming: boolean
  recordingTime: number
  status: string
  mode: RecordingMode
  bufferHealth: number // 0-1 indicating buffer efficiency
  accumulatedText: string // For streaming text accumulation
  streamingMetrics?: {
    latency: number
    droppedFrames: number
    bytesStreamed: number
  }
}

/**
 * Adaptive Buffering Manager
 * Monitors performance and adjusts buffer parameters dynamically
 */
class AdaptiveBufferingManager {
  private performanceHistory: number[] = []
  private latencyHistory: number[] = []
  private readonly maxHistorySize = 20

  /**
   * Record performance metrics
   */
  recordMetrics(latency: number, bufferHealth: number): void {
    this.latencyHistory.push(latency)
    this.performanceHistory.push(bufferHealth)

    // Keep history size manageable
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift()
    }
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift()
    }
  }

  /**
   * Get recommended buffer size based on performance history
   */
  getRecommendedBufferSize(currentSize: number): number {
    if (this.performanceHistory.length < 5) {
      return currentSize // Not enough data yet
    }

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
    const avgHealth =
      this.performanceHistory.reduce((a, b) => a + b, 0) / this.performanceHistory.length

    // Increase buffer size if latency is high or health is poor
    if (avgLatency > 200 || avgHealth < 0.6) {
      return Math.min(currentSize * 1.5, 16384) // Cap at 16KB
    }

    // Decrease buffer size if performance is consistently good
    if (avgLatency < 50 && avgHealth > 0.9) {
      return Math.max(currentSize * 0.8, 1024) // Floor at 1KB
    }

    return currentSize
  }

  /**
   * Check if buffering needs adjustment
   */
  shouldAdjustBuffering(): boolean {
    if (this.performanceHistory.length < 3) {
      return false
    }

    // Check for recent performance degradation
    const recent = this.performanceHistory.slice(-3)
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length

    return recentAvg < 0.7 // Adjust if recent performance is poor
  }

  /**
   * Reset metrics history
   */
  reset(): void {
    this.performanceHistory = []
    this.latencyHistory = []
  }
}

/**
 * Enhanced Audio Recording Service with Real-Time Streaming
 */
export class EnhancedAudioRecordingService {
  private recordingSubscription: Subscription | null = null
  private stopSubject: Subject<void> | null = null
  private timerInterval: NodeJS.Timeout | null = null
  private realTimeStreaming: RealTimeAudioStreamingService | null = null
  private integrationService: GeminiLiveIntegrationService | null = null
  private adaptiveManager: AdaptiveBufferingManager
  private lastTranscriptionTime: number = 0 // 🛡️ Track last transcription call for rate limiting

  private config: AudioRecordingConfig
  private state: EnhancedRecordingState
  private stateSubject: BehaviorSubject<EnhancedRecordingState>

  constructor(config: Partial<AudioRecordingConfig> = {}) {
    this.config = {...DEFAULT_RECORDING_CONFIG, ...config}
    this.adaptiveManager = new AdaptiveBufferingManager()

    this.state = {
      isRecording: false,
      isTranscribing: false,
      isStreaming: false,
      recordingTime: 0,
      status: 'Ready to record',
      mode: this.config.mode,
      bufferHealth: 1.0,
      accumulatedText: ''
    }

    this.stateSubject = new BehaviorSubject(this.state)
  }

  /**
   * Initialize the enhanced recording service
   */
  async initialize(integrationService?: GeminiLiveIntegrationService | null): Promise<void> {
    this.integrationService = integrationService || null

    // Initialize real-time streaming if enabled
    if (this.config.enableRealTimeStreaming) {
      this.realTimeStreaming = createRealTimeAudioStreaming({
        bufferSize: this.config.bufferSize,
        enableVAD: true
      })

      if (this.integrationService) {
        await this.realTimeStreaming.initialize(this.integrationService)
      }

      // Set up streaming event handlers
      this.setupStreamingEventHandlers()
    }
  }

  /**
   * Set up event handlers for real-time streaming
   */
  private setupStreamingEventHandlers(): void {
    if (!this.realTimeStreaming) return

    this.realTimeStreaming.on('metrics', metrics => {
      this.updateStreamingMetrics(metrics)
    })

    this.realTimeStreaming.on('bufferOverflow', data => {
      console.warn('Buffer overflow detected:', data)
      this.adaptBuffering()
    })

    this.realTimeStreaming.on('error', error => {
      console.error('Streaming error:', error)
      this.handleStreamingError(error)
    })
  }

  /**
   * Update streaming metrics in state
   */
  private updateStreamingMetrics(metrics: StreamingMetrics): void {
    this.updateState({
      bufferHealth: this.calculateBufferHealth(metrics),
      streamingMetrics: {
        latency: metrics.averageLatency || 0,
        droppedFrames: metrics.droppedFrames || 0,
        bytesStreamed: metrics.bufferedDuration || 0
      }
    })

    // Record metrics for adaptive buffering
    if (this.config.adaptiveBuffering) {
      this.adaptiveManager.recordMetrics(metrics.averageLatency || 0, this.state.bufferHealth)

      // Adjust buffering if needed
      if (this.adaptiveManager.shouldAdjustBuffering()) {
        this.adaptBuffering()
      }
    }
  }

  /**
   * Calculate buffer health score based on metrics
   */
  private calculateBufferHealth(metrics: StreamingMetrics): number {
    const latencyScore = Math.max(0, 1 - (metrics.averageLatency || 0) / 1000)
    const dropScore = Math.max(0, 1 - (metrics.droppedFrames || 0) / 100)
    const throttleScore = metrics.networkThrottling ? 0.5 : 1.0

    return (latencyScore + dropScore + throttleScore) / 3
  }

  /**
   * Adapt buffering parameters based on performance
   */
  private adaptBuffering(): void {
    if (!this.realTimeStreaming || !this.config.adaptiveBuffering) return

    const currentConfig = this.realTimeStreaming.getConfig()
    const newBufferSize = this.adaptiveManager.getRecommendedBufferSize(currentConfig.bufferSize)

    if (newBufferSize !== currentConfig.bufferSize) {
      console.log(`Adapting buffer size: ${currentConfig.bufferSize} -> ${newBufferSize}`)

      this.realTimeStreaming.updateConfig({
        bufferSize: newBufferSize,
        chunkDurationMs: Math.max(50, newBufferSize / 160) // Adjust chunk duration based on buffer size
      })
    }
  }

  /**
   * Handle streaming errors with fallback strategies
   */
  private handleStreamingError(error: Error): void {
    console.error('Streaming error, attempting fallback:', error)

    // Check if this is a quota error
    const errorMessage = error.message.toLowerCase()
    const isQuotaError = errorMessage.includes('quota') || 
                        errorMessage.includes('rate limit') || 
                        errorMessage.includes('connection closed') ||
                        (error as any).code === 1000 // WebSocket close code for quota exceeded

    if (isQuotaError) {
      console.warn('🚨 Quota error detected, notifying state manager but allowing fallback to batch mode')
      
      // Notify the transcription state manager about quota issue
      const stateManager = this.stateManager
      if (stateManager && typeof stateManager.handleQuotaExceeded === 'function') {
        stateManager.handleQuotaExceeded()
      }

      // Set warning status but don't stop - let IPC handle batch fallback
      this.updateState({
        status: 'WebSocket Quota Exceeded - Falling back to Batch API'
      })

      // Don't stop recording - let the batch fallback handle it
      // The IPC transcription will automatically fall back to batch mode

      // Continue to fallback logic instead of returning early
    }

    // Switch to interval mode if real-time streaming fails
    if (this.config.mode === RecordingMode.REALTIME || this.config.mode === RecordingMode.HYBRID) {
      this.updateState({
        mode: RecordingMode.INTERVAL,
        status: 'Fallback to interval mode due to streaming error'
      })

      // If we're currently recording, restart in interval mode
      if (this.state.isRecording) {
        this.stopRecording()
        setTimeout(() => {
          this.startRecording()
        }, 1000)
      }
    }
  }

  /**
   * Start recording with the configured mode
   */
  async startRecording(onTranscription?: (result: TranscriptionResult) => void): Promise<void> {
    if (this.state.isRecording) {
      console.log('Recording already in progress')
      return
    }

    // Check if service is available (including quota status)
    const stateManager = getTranscriptionStateManager()
    if (!stateManager.isServiceAvailable()) {
      console.warn('🚨 Service unavailable - cannot start recording')
      this.updateState({
        status: 'Service Unavailable - Check quota or connection status'
      })
      return
    }

    this.updateState({
      isRecording: true,
      recordingTime: 0,
      status: `Recording... (${this.state.mode} mode)`,
      accumulatedText: '' // Reset accumulated text for new recording
    })

    // Start timer for recording time
    this.timerInterval = setInterval(() => {
      this.updateState({recordingTime: this.state.recordingTime + 1})
      
      // 🛡️ Monitor circuit breaker status and auto-stop if needed
      const stateManager = getTranscriptionStateManager()
      if (!stateManager.isTranscriptionServiceAvailable()) {
        const breakerStatus = EmergencyCircuitBreaker.getInstance().getEmergencyStatus()
        const transcriptionBreaker = breakerStatus['transcription-ipc-handler'] as any
        const intervalBreaker = breakerStatus['interval-audio-processing'] as any
        
        // If circuit breaker has been open for more than 30 seconds, stop recording
        if (transcriptionBreaker?.isOpen || intervalBreaker?.isOpen) {
          const openTime = transcriptionBreaker?.openedAt || intervalBreaker?.openedAt
          if (openTime && (Date.now() - openTime > 30000)) { // 30 seconds
            console.warn('🚨 Auto-stopping recording due to persistent circuit breaker issues')
            this.stopRecording()
            this.updateState({
              status: 'Recording stopped - service temporarily unavailable'
            })
          }
        }
      }
    }, 1000)

    try {
      switch (this.state.mode) {
        case RecordingMode.REALTIME:
          await this.startRealTimeRecording(onTranscription)
          break
        case RecordingMode.INTERVAL:
          await this.startIntervalRecording(onTranscription)
          break
        case RecordingMode.HYBRID:
          await this.startHybridRecording(onTranscription)
          break
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateState({
        isRecording: false,
        status: `Recording error: ${errorMessage}`
      })
      this.cleanup()
    }
  }

  /**
   * Start real-time streaming recording
   */
  private async startRealTimeRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    if (!this.realTimeStreaming) {
      throw new Error('Real-time streaming not initialized')
    }

    await this.realTimeStreaming.startStreaming()
    this.updateState({isStreaming: true})

    // Set up transcription handling if integration service is available
    if (this.integrationService && onTranscription) {
      this.integrationService.on('transcriptionResult', onTranscription)
    }
  }

  /**
   * Start interval-based recording (legacy mode)
   */
  private async startIntervalRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    console.log(`Starting interval recording (${this.config.intervalSeconds} second intervals)`)

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>()
    this.stopSubject = stopSubject

    try {
      // Get the audio capture service based on current process
      // Use 16kHz sample rate for Gemini Live API compatibility
      const audioCapture = await getAudioCapture({
        sampleRate: 16000, // Changed from 44100 to 16000 for Gemini Live API
        channels: 1,
        // 🔧 CRITICAL FIX: Increase buffer size to generate 300ms chunks for Gemini Live API
        // Calculation: 300ms * 16000 samples/sec = 4800 samples minimum
        // Using 8000 samples = 500ms to ensure we exceed the 100ms minimum requirement
        bufferSize: this.config.bufferSize || 8000, // Generate 500ms audio chunks (was 8192)
        intervalSeconds: this.config.intervalSeconds || 3
      })

      // Set up audio chunk handler
      const audioChunks: AudioChunkData[] = []
      let isProcessingChunks = false // 🛡️ Prevent concurrent chunk processing
      
      audioCapture.on('audioChunk', (chunkData: AudioChunkData) => {
        // Only accumulate chunks if not currently processing AND buffer not too full
        if (!isProcessingChunks && audioChunks.length < 2) {
          audioChunks.push(chunkData)
          
          // Limit the number of chunks to prevent memory buildup
          const MAX_CHUNKS = 3  // Very aggressive limit to prevent overflow
          if (audioChunks.length > MAX_CHUNKS) {
            console.warn(`🚨 Audio chunk buffer overflow - keeping only last ${MAX_CHUNKS} chunks`)
            audioChunks.splice(0, audioChunks.length - MAX_CHUNKS)
          }
        } else {
          if (isProcessingChunks) {
            console.log('🛡️ Skipping audio chunk - processing already in progress')
          } else {
            console.log('🛡️ Skipping audio chunk - buffer near capacity')
          }
        }
      })

      // Set up interval processing - use the configured interval seconds (minimum 5 seconds for efficiency)
      const minInterval = Math.max((this.config.intervalSeconds || 3), 5)
      const intervalObservable = interval(minInterval * 1000)

      this.recordingSubscription = intervalObservable.pipe(takeUntil(stopSubject)).subscribe({
        next: async () => {
          // 🛡️ Skip if already processing chunks to prevent overlapping processing
          if (isProcessingChunks) {
            console.log('🛡️ EnhancedAudioRecording: Skipping interval - chunk processing already in progress')
            return
          }
          
          // 🛡️ Check circuit breaker before processing chunks to prevent infinite loops
          const breaker = EmergencyCircuitBreaker.getInstance()
          if (!breaker.emergencyCallGuard('interval-audio-processing')) {
            console.warn('🚨 EnhancedAudioRecording: Skipping interval processing - circuit breaker is OPEN')
            return
          }

          try {
            if (audioChunks.length > 0) {
              isProcessingChunks = true // 🛡️ Set processing flag
              console.log(`Processing ${audioChunks.length} audio chunks for interval transcription`)
              
              // Create a copy of chunks and clear the original array to prevent accumulation
              const chunksToProcess = audioChunks.splice(0)
              
              // Add timeout protection for chunk processing
              const processingTimeout = setTimeout(() => {
                console.warn('🚨 Audio chunk processing timeout - forcing reset')
                isProcessingChunks = false
              }, 30000) // 30 second timeout
              
              try {
                await this.processAudioChunks(chunksToProcess, onTranscription)
                clearTimeout(processingTimeout)
              } catch (processingError) {
                clearTimeout(processingTimeout)
                throw processingError
              }
            }
            
            // Mark interval processing as successful
            breaker.emergencyCallComplete('interval-audio-processing')
          } catch (error) {
            // Report error and prevent infinite recursion
            breaker.reportError('interval-audio-processing', error as Error)
            console.error('🚨 Interval processing failed, circuit breaker will prevent further attempts:', error)
            
            // Clear chunks to prevent accumulation during circuit breaker trip
            audioChunks.length = 0
          } finally {
            isProcessingChunks = false // 🛡️ Always reset processing flag
          }
        },
        error: err => {
          console.error('Interval recording error:', err)
          
          // Report error to circuit breaker for interval recording
          const breaker = EmergencyCircuitBreaker.getInstance()
          breaker.reportError('interval-recording-observable', err)
          
          // Stop recording if interval observable fails
          this.stopRecording()
          
          this.updateState({
            status: `Recording error: ${err.message}`,
            isRecording: false
          })
          this.cleanup()
        },
        complete: () => {
          console.log('Interval recording completed')
          audioCapture.destroy()
          this.updateState({
            isRecording: false,
            status: 'Ready to record'
          })
        }
      })

      // Start the audio capture
      await audioCapture.startCapture()
    } catch (error) {
      console.error('Failed to start interval recording:', error)
      throw error
    }
  }

  /**
   * Start hybrid recording (both real-time and interval)
   */
  private async startHybridRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    // Start real-time streaming for immediate response
    if (this.realTimeStreaming) {
      try {
        await this.startRealTimeRecording(onTranscription)
      } catch (error) {
        console.warn('Real-time streaming failed, falling back to interval mode:', error)
        this.handleStreamingError(error as Error)
        return
      }
    }

    // Also start interval recording for backup/quality assurance
    await this.startIntervalRecording(onTranscription)
  }

  /**
   * Process audio chunks from the new audio capture system
   */
  private async processAudioChunks(
    chunks: AudioChunkData[],
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<TranscriptionResult | null> {
    // 🛡️ Check if transcription service is available (circuit breaker check)
    const stateManager = getTranscriptionStateManager()
    if (!stateManager.isTranscriptionServiceAvailable()) {
      console.warn('🚨 EnhancedAudioRecording: Transcription service unavailable - circuit breaker is OPEN')
      this.updateState({
        status: 'Transcription service temporarily unavailable',
        isTranscribing: false
      })
      return null
    }

    // 🛡️ Prevent recursive transcription calls
    if (this.state.isTranscribing) {
      console.warn('🚨 EnhancedAudioRecording: Transcription already in progress - skipping to prevent recursion')
      return null
    }

    // 🛡️ Rate limiting to prevent excessive API calls but allow reasonable responsiveness
    const now = Date.now()
    const timeSinceLastCall = now - (this.lastTranscriptionTime || 0)
    const MIN_CALL_INTERVAL = 500 // Reduced to 500ms for better responsiveness
    
    if (timeSinceLastCall < MIN_CALL_INTERVAL) {
      console.log(`🛡️ EnhancedAudioRecording: Rate limiting - only ${timeSinceLastCall}ms since last call, skipping`)
      return null
    }
    
    this.lastTranscriptionTime = now

    try {
      this.updateState({
        isTranscribing: true,
        status: 'Processing audio...'
      })

      if (chunks.length === 0) {
        console.log('No audio chunks to process')
        return null
      }

      // Combine all audio buffers from chunks
      const combinedAudio = chunks.reduce((acc, chunk) => {
        acc.push(...chunk.buffer)
        return acc
      }, [] as number[])

      if (combinedAudio.length === 0) {
        console.log('Combined audio is empty')
        return null
      }

      console.log(
        `Processing ${sanitizeLogMessage(combinedAudio.length.toString())} audio samples from ${sanitizeLogMessage(chunks.length.toString())} chunks`
      )

      // Convert to Float32Array for processing
      const audioData = new Float32Array(combinedAudio)

      // 🛡️ Simple silence detection to avoid processing empty audio
      const rms = Math.sqrt(audioData.reduce((sum, sample) => sum + sample * sample, 0) / audioData.length)
      const SILENCE_THRESHOLD = 0.001 // Adjust this value as needed
      
      if (rms < SILENCE_THRESHOLD) {
        console.log(`🔇 Skipping silent audio chunk (RMS: ${rms.toFixed(6)})`)
        return null
      }
      
      console.log(`🎵 Processing audio chunk (RMS: ${rms.toFixed(6)}, samples: ${audioData.length})`)

      // Use the sample rate from the first chunk, or default to 16000 (matching our capture config)
      const sourceSampleRate = chunks[0]?.sampleRate || 16000
      const targetSampleRate = 16000 // Standard for speech recognition (matching Gemini Live API)

      // Resample if needed
      let processedAudio: Float32Array = audioData
      if (sourceSampleRate !== targetSampleRate) {
        const {resampleAudio} = await import('./audio-recording')
        processedAudio = resampleAudio(
          audioData,
          sourceSampleRate,
          targetSampleRate
        ) as Float32Array
        console.log(
          `Resampled audio from ${sanitizeLogMessage(audioData.length.toString())} to ${sanitizeLogMessage(processedAudio.length.toString())} samples`
        )
      }

      // Convert to WAV format
      const {renderAudioToWav} = await import('./audio-recording')
      const wavData = await renderAudioToWav(processedAudio)
      console.log(`Generated WAV file: ${sanitizeLogMessage(wavData.length.toString())} bytes`)

      // Send for transcription via IPC - will automatically fall back to batch mode if WebSocket fails
      if (window.transcriptionAPI?.transcribeAudio) {
        console.log(
          '🎤 EnhancedAudioRecording: Calling transcriptionAPI.transcribeAudio (AUTO MODE) with',
          wavData.length,
          'bytes'
        )
        
        // 🛡️ Add circuit breaker protection around the actual transcription call
        const breaker = EmergencyCircuitBreaker.getInstance()
        if (!breaker.emergencyCallGuard('transcription-ipc-handler')) {
          console.warn('🚨 EnhancedAudioRecording: Transcription blocked by circuit breaker')
          this.updateState({
            status: 'Transcription service temporarily unavailable',
            isTranscribing: false
          })
          return null
        }
        
        let result: any = null
        try {
          result = await window.transcriptionAPI.transcribeAudio(wavData)
          
          // Mark the call as successful
          breaker.emergencyCallComplete('transcription-ipc-handler')
          
          console.log('🎤 EnhancedAudioRecording: RAW IPC RESULT STRUCTURE:', {
            type: typeof result,
            keys: result ? Object.keys(result) : 'null',
            fullResult: JSON.stringify(result, null, 2)
          })
          
          // 🔍 Enhanced API Response Analysis
          console.log('🎤 EnhancedAudioRecording: ENHANCED API RESPONSE ANALYSIS:', {
            hasResult: !!result,
            resultType: typeof result,
            hasText: result && 'text' in result,
            textValue: result?.text,
            textIsString: typeof result?.text === 'string',
            textLength: result?.text?.length || 0,
            confidence: result?.confidence,
            duration: result?.duration,
            source: result?.source,
            audioSize: wavData.length,
            rmsLevel: rms.toFixed(6),
            sampleCount: audioData.length,
            estimatedDurationMs: (audioData.length / targetSampleRate) * 1000
          })
          
        } catch (transcriptionError) {
          // Report the error to circuit breaker
          breaker.reportError('transcription-ipc-handler', transcriptionError as Error)
          console.error('🎤 EnhancedAudioRecording: TRANSCRIPTION API ERROR:', {
            error: transcriptionError,
            errorMessage: transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error',
            audioSize: wavData.length,
            rmsLevel: rms.toFixed(6),
            sampleCount: audioData.length
          })
          throw transcriptionError // Re-throw to be handled by outer catch
        }
        console.log('🎤 EnhancedAudioRecording: Result text analysis:', {
          text: result?.text,
          textType: typeof result?.text,
          textLength: result?.text?.length,
          textTrimmed: result?.text?.trim(),
          textTrimmedLength: result?.text?.trim()?.length,
          textTruthyCheck: !!result?.text?.trim()
        })
        console.log(
          '🎤 EnhancedAudioRecording: onTranscription callback exists:',
          !!onTranscription,
          '- Using WebSocket streaming mode'
        )

        // 🔍 DEBUG: Force processing ALL results to test display pipeline
        const hasNonEmptyText = result?.text?.trim() && result.text.trim().length > 0
        
        // TEMPORARILY FORCE ALL RESULTS TO BE PROCESSED TO TEST DISPLAY PIPELINE
        const isValidResult = true  // Force all results to be considered valid
        const shouldProcessResult = onTranscription && isValidResult
        
        console.log('🎤 EnhancedAudioRecording: Processing decision:', {
          hasCallback: !!onTranscription,
          hasResult: !!result,
          hasNonEmptyText,
          confidence: result?.confidence,
          isValidResult,
          shouldProcessResult
        })
        
        if (!shouldProcessResult) {
          console.log('🔇 EnhancedAudioRecording: DEBUG MODE - Would normally skip, but forcing processing to test display pipeline:', {
            text: result?.text,
            confidence: result?.confidence
          })
          // Don't return - continue processing to test display pipeline
        }

        if (shouldProcessResult) {
          if (hasNonEmptyText) {
            console.log('🎤 EnhancedAudioRecording: ✅ CALLING onTranscription callback with result')
          } else {
            console.log('🎤 EnhancedAudioRecording: 🔍 DEBUG: Processing empty result to understand API behavior')
          }
          
          // Declare variables outside try block to avoid scoping issues
          let newText = ''
          let updatedAccumulatedText = ''
          let formattedResult: TranscriptionResult | null = null
          
          // 🛡️ Prevent callback recursion by wrapping in try-catch and timeout
          try {
            const callbackTimeout = setTimeout(() => {
              console.warn('🚨 onTranscription callback timeout - possible hang detected')
            }, 5000) // 5 second timeout
            
            // Accumulate the text for streaming display
            newText = result.text.trim()
            console.log('🎤 EnhancedAudioRecording: NEW CHUNK TEXT:', `"${newText}"`)
            console.log('🎤 EnhancedAudioRecording: CURRENT ACCUMULATED TEXT:', `"${this.state.accumulatedText}"`)
            updatedAccumulatedText = this.state.accumulatedText + (this.state.accumulatedText ? ' ' : '') + newText
            console.log('🎤 EnhancedAudioRecording: UPDATED ACCUMULATED TEXT:', `"${updatedAccumulatedText}"`)
            
            // Update state with accumulated text
            this.updateState({
              accumulatedText: updatedAccumulatedText
            })
            
            // Ensure the result has proper formatting for UI rendering
            formattedResult = {
              text: newText, // Individual chunk text for callback
              confidence: result.confidence || 0.9,
              duration: result.duration || 0,
              timestamp: (typeof result.timestamp === 'number' ? result.timestamp : Date.now()),
              source: result.source || 'batch' // Use actual source from transcription result
            }
            
            console.log('🎤 EnhancedAudioRecording: Formatted result for UI:', formattedResult)
            console.log('🎤 EnhancedAudioRecording: Updated accumulated text:', updatedAccumulatedText)
            console.log('🎤 EnhancedAudioRecording: About to call onTranscription with formatted result')
            
            // 🛡️ Use setTimeout to break the call stack and prevent immediate recursion
            setTimeout(() => {
              try {
                if (formattedResult) {
                  onTranscription(formattedResult)
                  console.log('🎤 EnhancedAudioRecording: ✅ onTranscription callback completed successfully')
                }
              } catch (callbackError) {
                console.error('🚨 EnhancedAudioRecording: Error in onTranscription callback:', callbackError)
              }
            }, 0) // Execute on next tick to break recursion chain
            
            clearTimeout(callbackTimeout)
          } catch (callbackError) {
            console.error('🚨 EnhancedAudioRecording: Error preparing onTranscription callback:', callbackError)
            // Don't re-throw to prevent cascading failures
          }
          
          // Force a broadcast event with accumulated text for streaming display
          if (window.electronWindow?.broadcast && formattedResult) {
            console.log('🔥 FORCING broadcast of streaming transcription result for UI update')
            console.log('🔥 Broadcasting accumulated text:', updatedAccumulatedText)
            console.log('🔥 Individual chunk text:', newText)
            
            // 🛡️ Use setTimeout to break the call stack for broadcasts too
            setTimeout(() => {
              if (formattedResult) {
                console.log('🔥 [ENHANCED-AUDIO] Broadcasting streaming-transcription with flags:', {
                  isFinal: false,
                  isPartial: true,
                  timestamp: Date.now(),
                  source: formattedResult.source,
                  textLength: updatedAccumulatedText?.length || 0
                })
                window.electronWindow.broadcast('streaming-transcription', {
                  text: updatedAccumulatedText, // Send full accumulated text
                  isFinal: false, // Mark as partial for streaming behavior
                  isPartial: true, // This is a partial result in the streaming session
                  source: formattedResult.source, // Use the actual transcription source
                  confidence: formattedResult.confidence,
                  timestamp: formattedResult.timestamp,
                  chunkText: newText // Also send the individual chunk for debugging
                })
                console.log('🔥 FORCED broadcast completed')
              }
            }, 0) // Execute on next tick to break recursion chain
          }
        } else {
          console.log(
            '🎤 EnhancedAudioRecording: ❌ SKIPPING onTranscription callback because:',
            {
              hasCallback: !!onTranscription,
              hasResult: !!result,
              hasText: !!result?.text,
              textValue: result?.text,
              textTrimmed: result?.text?.trim(),
              textTrimmedTruthy: !!result?.text?.trim(),
              hasValidLength: result?.text?.trim()?.length > 0,
              source: result?.source,
              originalCondition: !!(onTranscription && result?.text?.trim() && result.text.trim().length > 0),
              debugModeActive: false // This branch should not be reached with debug mode
            }
          )
          
          // 🔍 DEBUG: Log additional context for empty results
          if (result && !result?.text?.trim()) {
            console.log('🔍 DEBUG: Empty transcription result analysis:', {
              resultKeys: Object.keys(result),
              confidence: result.confidence,
              duration: result.duration,
              source: result.source,
              possibleCauses: [
                'Audio too short',
                'Audio quality too low', 
                'Background noise',
                'Silence detection issue',
                'API configuration problem'
              ]
            })
          }
        }

        return result
      } else {
        console.error('Transcription IPC not available')
        return null
      }
    } catch (error) {
      console.error('Error processing audio chunks:', error)
      this.updateState({status: 'Error processing audio'})
      return null
    } finally {
      this.updateState({
        isTranscribing: false,
        status: this.state.isRecording
          ? `Recording... (${this.state.mode} mode)`
          : 'Ready to record'
      })
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(): Promise<void> {
    if (!this.state.isRecording) {
      console.log('No recording in progress')
      return
    }

    console.log('Stopping recording')
    this.updateState({status: 'Stopping recording...'})

    // Stop real-time streaming if active
    if (this.state.isStreaming && this.realTimeStreaming) {
      await this.realTimeStreaming.stopStreaming()
      this.updateState({isStreaming: false})
    }

    // Send final broadcast with accumulated text if we have any
    if (this.state.accumulatedText && window.electronWindow?.broadcast) {
      console.log('🔥 Sending final accumulated transcription:', this.state.accumulatedText)
      window.electronWindow.broadcast('streaming-transcription', {
        text: this.state.accumulatedText,
        isFinal: true,
        isPartial: false,
        source: 'batch-final', // Indicate this is the final result from batch processing
        confidence: 1.0,
        timestamp: Date.now()
      })
    }

    this.cleanup()

    this.updateState({
      isRecording: false,
      recordingTime: 0,
      status: 'Ready to record',
      accumulatedText: '' // Clear accumulated text
    })

    console.log('Recording stopped')
  }

  /**
   * Toggle recording state
   */
  async toggleRecording(onTranscription?: (result: TranscriptionResult) => void): Promise<void> {
    if (this.state.isRecording) {
      await this.stopRecording()
    } else {
      await this.startRecording(onTranscription)
    }
  }

  /**
   * Update recording configuration
   */
  updateConfig(updates: Partial<AudioRecordingConfig>): void {
    this.config = {...this.config, ...updates}

    // Update real-time streaming config if applicable
    if (this.realTimeStreaming && updates.bufferSize) {
      this.realTimeStreaming.updateConfig({
        bufferSize: updates.bufferSize
      })
    }

    // Update mode if changed
    if (updates.mode) {
      this.updateState({mode: updates.mode})
    }
  }

  /**
   * Get current state as observable
   */
  getStateObservable() {
    return this.stateSubject.asObservable()
  }

  /**
   * Get current state
   */
  getState(): EnhancedRecordingState {
    return {...this.state}
  }

  /**
   * Get current configuration
   */
  getConfig(): AudioRecordingConfig {
    return {...this.config}
  }

  /**
   * Update state and notify subscribers
   */
  private updateState(updates: Partial<EnhancedRecordingState>): void {
    this.state = {...this.state, ...updates}
    this.stateSubject.next(this.state)
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }

    // Trigger the stop subject
    if (this.stopSubject) {
      this.stopSubject.next()
      this.stopSubject.complete()
      this.stopSubject = null
    }

    // Unsubscribe from the recording subscription
    if (this.recordingSubscription) {
      this.recordingSubscription.unsubscribe()
      this.recordingSubscription = null
    }
  }

  /**
   * Emergency reset - forcefully stop all recording and clear state
   * Call this method when the system gets into a bad state
   */
  emergencyReset(): void {
    console.warn('🚨 EnhancedAudioRecordingService: Performing emergency reset')
    
    try {
      // Step 1: Clear the processing flags
      if (this.state) {
        (this.state as any).isProcessingChunks = false
      }
      
      // Step 2: Reset transcription timing
      this.lastTranscriptionTime = 0
      
      // Step 3: Clear all subscriptions and timers
      if (this.recordingSubscription) {
        this.recordingSubscription.unsubscribe()
        this.recordingSubscription = null
      }
      
      if (this.stopSubject) {
        this.stopSubject.next()
        this.stopSubject.complete()
        this.stopSubject = null
      }
      
      if (this.timerInterval) {
        clearInterval(this.timerInterval)
        this.timerInterval = null
      }
      
      // Step 4: Reset state to clean values
      this.state = {
        isRecording: false,
        isTranscribing: false,
        isStreaming: false,
        recordingTime: 0,
        status: 'Reset - Ready to record',
        mode: this.config.mode,
        bufferHealth: 1.0,
        accumulatedText: ''
      }
      
      // Step 5: Broadcast the reset state
      this.stateSubject.next(this.state)
      
      // Step 6: Reset adaptive manager
      if (this.adaptiveManager) {
        this.adaptiveManager.reset()
      }
      
      console.log('✅ EnhancedAudioRecordingService: Emergency reset completed')
    } catch (error) {
      console.error('❌ Error during emergency reset:', error)
    }
  }

  /**
   * Destroy the service and cleanup all resources
   */
  async destroy(): Promise<void> {
    await this.stopRecording()

    if (this.realTimeStreaming) {
      await this.realTimeStreaming.cleanup()
      this.realTimeStreaming = null
    }

    this.adaptiveManager.reset()
    this.stateSubject.complete()
  }
}

// Singleton instance for shared use
let enhancedAudioRecordingServiceInstance: EnhancedAudioRecordingService | null = null

/**
 * Get the singleton enhanced audio recording service instance
 */
export function getEnhancedAudioRecordingService(): EnhancedAudioRecordingService {
  if (!enhancedAudioRecordingServiceInstance) {
    enhancedAudioRecordingServiceInstance = new EnhancedAudioRecordingService()
  }
  return enhancedAudioRecordingServiceInstance
}

/**
 * 🧪 GLOBAL TEST FUNCTION: Force a test transcription to verify display pipeline
 */
function forceTestTranscription(): void {
  console.log('🧪 FORCING test transcription to verify display pipeline...')
  
  const testResult = {
    text: `Manual test transcription at ${new Date().toLocaleTimeString()}`,
    confidence: 0.95,
    duration: 1000,
    timestamp: Date.now(),
    source: 'manual-test'
  }
  
  // Test the broadcast system
  if (typeof window !== 'undefined' && window.electronWindow?.broadcast) {
    console.log('🧪 Broadcasting test transcription result')
    window.electronWindow.broadcast('transcription-result', testResult)
    
    window.electronWindow.broadcast('streaming-transcription', {
      text: testResult.text,
      isFinal: true,
      isPartial: false,
      source: testResult.source,
      confidence: testResult.confidence,
      timestamp: testResult.timestamp
    })
    
    console.log('🧪 Test transcription sent - check Assistant window for display')
  } else {
    console.error('🧪 No broadcast function available')
  }
}

// Export to global scope for testing (only in browser/renderer environment)
if (typeof window !== 'undefined' && window && typeof document !== 'undefined') {
  try {
    const globalWindow = window as any
    if (globalWindow && typeof globalWindow === 'object') {
      globalWindow.forceTestTranscription = forceTestTranscription
      
      // Add batch API test function
      globalWindow.forceBatchTest = async () => {
        if (typeof window !== 'undefined' && window.transcriptionAPI?.transcribeAudioBatch) {
          console.log('🧪 BATCH TEST: Testing batch API with silent audio')
          const silentWav = new Uint8Array(556) // Create silent audio similar to actual recordings
          try {
            const result = await window.transcriptionAPI.transcribeAudioBatch(silentWav)
            console.log('🧪 BATCH TEST RESULT:', result)
            return result
          } catch (error) {
            console.error('🧪 BATCH TEST ERROR:', error)
            return null
          }
        } else {
          console.warn('🧪 BATCH TEST: No batch API available')
          return null
        }
      }
    }
  } catch (error) {
    console.warn('Failed to attach global test functions:', error)
  }
}

/**
 * Factory function to create a new enhanced recording service with custom config
 */
export function createEnhancedAudioRecording(
  config?: Partial<AudioRecordingConfig>
): EnhancedAudioRecordingService {
  return new EnhancedAudioRecordingService(config)
}

// Make service available globally for emergency access (only in browser/renderer environment)
if (typeof window !== 'undefined' && window && typeof document !== 'undefined') {
  try {
    const globalWindow = window as any
    if (globalWindow && typeof globalWindow === 'object') {
      globalWindow.enhancedAudioRecording = getEnhancedAudioRecordingService()
    }
  } catch (error) {
    console.warn('Failed to attach global audio recording service:', error)
  }
}
