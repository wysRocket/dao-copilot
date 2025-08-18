import {Subject, Subscription, interval} from 'rxjs'
import {getTranscriptionTelemetry, TELEMETRY_COUNTERS} from './transcription-telemetry'
import {takeUntil} from 'rxjs/operators'
import {getAudioCapture, type AudioChunkData} from './audio-capture-factory'
import {renderWavFile} from './wav'
import {sanitizeLogMessage} from './log-sanitizer'

// Constants
// Narrow type helpers to avoid any
interface IntervalImportMetaEnv {
  VITE_AUDIO_INTERVAL_SECONDS?: string
  VITE_DELIVER_EMPTY_TRANSCRIPTS?: string
}
interface IntervalImportMeta {
  env?: IntervalImportMetaEnv
}
interface IntervalWindow {
  __AUDIO_INTERVAL_SECONDS?: number
}
interface IntervalProcessEnv {
  AUDIO_INTERVAL_SECONDS?: string
  DELIVER_EMPTY_TRANSCRIPTS?: string
}
interface IntervalProcess {
  env?: IntervalProcessEnv
}

// Interval (seconds) can be overridden via env (VITE_AUDIO_INTERVAL_SECONDS or AUDIO_INTERVAL_SECONDS) or window var
export const INTERVAL_SECONDS = (() => {
  const winVal =
    typeof window !== 'undefined'
      ? (window as unknown as IntervalWindow).__AUDIO_INTERVAL_SECONDS
      : undefined
  const meta = import.meta as unknown as IntervalImportMeta
  const proc: IntervalProcess | undefined =
    typeof process !== 'undefined' ? (process as unknown as IntervalProcess) : undefined
  const envVal = meta.env?.VITE_AUDIO_INTERVAL_SECONDS || proc?.env?.AUDIO_INTERVAL_SECONDS
  const parsed = Number(winVal ?? envVal)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3 // default lowered from 10 -> 3 for latency
})()
export const TARGET_SAMPLE_RATE = 8000
export const DEVICE_SAMPLE_RATE = 44100

/**
 * Transcription result interface
 */
export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  timestamp?: number
  source?: string // Add source information
}

/**
 * Recording state interface
 */
export interface RecordingState {
  isRecording: boolean
  isTranscribing: boolean
  recordingTime: number
  status: string
}

/**
 * Simple audio resampling function to convert from one sample rate to another
 */
export function resampleAudio(
  audioData: Float32Array,
  originalSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (originalSampleRate === targetSampleRate) {
    return audioData
  }

  const ratio = originalSampleRate / targetSampleRate
  const newLength = Math.round(audioData.length / ratio)
  const result = new Float32Array(newLength)

  // Simple linear interpolation resampling
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index

    if (index >= audioData.length - 1) {
      result[i] = audioData[audioData.length - 1]
    } else {
      result[i] = audioData[index] * (1 - fraction) + audioData[index + 1] * fraction
    }
  }

  return result
}

/**
 * Renders audio data as a WAV file with the required format specifications:
 * - PCM encoding (16-bit)
 * - 8000 Hz sample rate
 * - Mono (1 channel)
 */
export async function renderAudioToWav(audioData: Float32Array): Promise<Uint8Array> {
  return renderWavFile(audioData, {
    isFloat: false, // PCM format (not floating point) - this will use 16-bit depth
    numChannels: 1, // Mono
    sampleRate: TARGET_SAMPLE_RATE // 8000 Hz
  })
}

/**
 * Audio Recording Service
 * Manages audio recording, processing, and transcription
 */
export class AudioRecordingService {
  private recordingSubscription: Subscription | null = null
  private stopSubject: Subject<void> | null = null
  private timerInterval: NodeJS.Timeout | null = null
  // Accumulates chunks between interval flushes so we can flush on manual stop
  private pendingAudioChunks: AudioChunkData[] = []
  // Track an in-flight processing promise to avoid races during stop flush
  private processingPromise: Promise<unknown> | null = null
  private earlyFlushTimer: NodeJS.Timeout | null = null
  private firstPendingTimestamp: number | null = null
  private lastChunkTimestamp: number | null = null
  private noChunkWatchdog: NodeJS.Timeout | null = null

  // Early flush tuning (ms)
  private static readonly EARLY_FLUSH_MS = 1500 // flush partial before full interval
  private static readonly FLUSH_POLL_MS = 400
  private static readonly MIN_CHUNKS_FOR_EARLY_FLUSH = 25 // guard against flushing extremely tiny captures
  private static readonly DELIVER_EMPTY_FLAG = (() => {
    const meta = import.meta as unknown as IntervalImportMeta
    const proc: IntervalProcess | undefined =
      typeof process !== 'undefined' ? (process as unknown as IntervalProcess) : undefined
    const envVal = meta.env?.VITE_DELIVER_EMPTY_TRANSCRIPTS || proc?.env?.DELIVER_EMPTY_TRANSCRIPTS
    return envVal ? envVal.toLowerCase() === 'true' : false
  })()

  private state: RecordingState = {
    isRecording: false,
    isTranscribing: false,
    recordingTime: 0,
    status: 'Ready to record'
  }

  private stateChangeCallbacks: Array<(state: RecordingState) => void> = []

  /**
   * Subscribe to recording state changes
   */
  onStateChange(callback: (state: RecordingState) => void): () => void {
    this.stateChangeCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback)
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1)
      }
    }
  }

  /**
   * Update state and notify subscribers
   */
  private updateState(updates: Partial<RecordingState>): void {
    this.state = {...this.state, ...updates}
    this.stateChangeCallbacks.forEach(callback => callback(this.state))
  }

  /**
   * Get current state
   */
  getState(): RecordingState {
    return {...this.state}
  }

  /**
   * Processes audio chunks from the new audio capture system
   */
  async processAudioChunks(
    chunks: AudioChunkData[],
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<TranscriptionResult | null> {
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

      const telemetry = getTranscriptionTelemetry()

      if (combinedAudio.length === 0) {
        console.log('Combined audio is empty')
        return null
      }

      console.log(
        `Processing ${sanitizeLogMessage(combinedAudio.length.toString())} audio samples from ${sanitizeLogMessage(chunks.length.toString())} chunks`
      )

      // Convert to Float32Array for processing
      const audioData = new Float32Array(combinedAudio)

      // Use the sample rate from the first chunk, or default to device sample rate
      const sourceSampleRate = chunks[0]?.sampleRate || DEVICE_SAMPLE_RATE

      // Resample from source sample rate to target sample rate
      const resampledAudio = resampleAudio(audioData, sourceSampleRate, TARGET_SAMPLE_RATE)

      console.log(`Resampled audio from ${audioData.length} to ${resampledAudio.length} samples`)

      // Convert to WAV format
      const wavData = await renderAudioToWav(resampledAudio)
      console.log(`Generated WAV file: ${wavData.length} bytes`)

      // Send for transcription via IPC
      if (window.transcriptionAPI?.transcribeAudio) {
        console.log(
          '🎤 AudioRecording: Calling transcriptionAPI.transcribeAudio with',
          wavData.length,
          'bytes'
        )
        const result = await window.transcriptionAPI.transcribeAudio(wavData)
        console.log('🎤 AudioRecording: RAW IPC RESULT STRUCTURE:', {
          type: typeof result,
          keys: result ? Object.keys(result) : 'null',
          fullResult: JSON.stringify(result, null, 2)
        })
        console.log('🎤 AudioRecording: Result text analysis:', {
          text: result?.text,
          textType: typeof result?.text,
          textLength: result?.text?.length,
          textTrimmed: result?.text?.trim(),
          textTrimmedLength: result?.text?.trim()?.length,
          textTruthyCheck: !!result?.text?.trim()
        })
        console.log('🎤 AudioRecording: onTranscription callback exists:', !!onTranscription)

        const trimmed = result?.text?.trim() || ''
        const isEmpty = trimmed.length === 0

        if (!trimmed && AudioRecordingService.DELIVER_EMPTY_FLAG && onTranscription) {
          telemetry.increment(TELEMETRY_COUNTERS.EMPTY_DELIVERED)
          onTranscription({
            ...result,
            text: '',
            source: result?.source || 'websocket',
            reason: 'empty_transcript'
          } as unknown as TranscriptionResult)
        }

        if (onTranscription && trimmed) {
          console.log('🎤 AudioRecording: ✅ CALLING onTranscription callback with result')
          onTranscription(result)
          console.log('🎤 AudioRecording: ✅ onTranscription callback completed successfully')
          telemetry.increment(TELEMETRY_COUNTERS.NON_EMPTY_DELIVERED)
        } else {
          console.error('🎤 AudioRecording: ❌ SKIPPING onTranscription callback because:', {
            hasCallback: !!onTranscription,
            hasResult: !!result,
            hasText: !!result?.text,
            textValue: result?.text,
            textTrimmed: result?.text?.trim(),
            textTrimmedTruthy: !!result?.text?.trim(),
            conditionResult: !!(onTranscription && result?.text?.trim())
          })
          if (isEmpty && !AudioRecordingService.DELIVER_EMPTY_FLAG) {
            telemetry.increment(TELEMETRY_COUNTERS.SILENCE_SKIPPED)
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
          ? `Recording... (${INTERVAL_SECONDS}s intervals)`
          : 'Ready to record'
      })
    }
  }

  /**
   * Processes a chunk of audio data by converting it to WAV and sending for transcription
   * (Legacy method - kept for backward compatibility)
   */
  async processAudioChunk(
    chunks: number[][],
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<TranscriptionResult | null> {
    // Convert legacy format to new format
    const audioChunks: AudioChunkData[] = chunks.map((chunk, index) => ({
      buffer: chunk,
      timestamp: Date.now() + index,
      sampleRate: DEVICE_SAMPLE_RATE,
      channels: 1
    }))

    return this.processAudioChunks(audioChunks, onTranscription)
  }

  /**
   * Starts recording audio in intervals using the new audio capture system
   */
  async startIntervalRecording(
    onTranscription?: (result: TranscriptionResult) => void
  ): Promise<void> {
    if (this.state.isRecording) {
      console.log('Recording already in progress')
      return
    }

    this.updateState({
      isRecording: true,
      recordingTime: 0,
      status: `Recording... (${INTERVAL_SECONDS}s intervals)`
    })

    // Start timer for recording time
    this.timerInterval = setInterval(() => {
      this.updateState({recordingTime: this.state.recordingTime + 1})
    }, 1000)

    console.log(`Starting interval recording (${INTERVAL_SECONDS} second intervals)`)

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>()
    this.stopSubject = stopSubject

    try {
      // Get the audio capture service
      const audioCapture = await getAudioCapture({
        sampleRate: DEVICE_SAMPLE_RATE,
        channels: 1,
        bufferSize: 4096,
        intervalSeconds: INTERVAL_SECONDS
      })

      // Reset pending chunk collection for this recording session
      this.pendingAudioChunks = []
      audioCapture.on('audioChunk', (chunkData: AudioChunkData) => {
        console.log('🎤 AudioRecording: Audio chunk received, size:', chunkData.buffer.length)
        this.pendingAudioChunks.push(chunkData)
        console.log('🎤 AudioRecording: Total chunks collected:', this.pendingAudioChunks.length)
        const now = Date.now()
        this.lastChunkTimestamp = now
        if (!this.firstPendingTimestamp) this.firstPendingTimestamp = chunkData.timestamp || now
      })

      // Set up interval processing
      const intervalObservable = interval(INTERVAL_SECONDS * 1000)

      this.recordingSubscription = intervalObservable.pipe(takeUntil(stopSubject)).subscribe({
        next: async () => {
          console.log('🎤 AudioRecording: Interval triggered, checking for audio chunks')
          console.log('🎤 AudioRecording: audioChunks.length:', this.pendingAudioChunks.length)
          if (this.pendingAudioChunks.length > 0) {
            console.log(
              `🎤 AudioRecording: Processing ${this.pendingAudioChunks.length} audio chunks for interval transcription`
            )
            console.log('🎤 AudioRecording: onTranscription callback provided:', !!onTranscription)
            // Move current chunks into a local array before releasing lock for new arrivals
            const batch = this.pendingAudioChunks.splice(0)
            this.processingPromise = this.processAudioChunks(batch, onTranscription)
            await this.processingPromise
            this.processingPromise = null
            getTranscriptionTelemetry().increment(TELEMETRY_COUNTERS.INTERVAL_FLUSH)
          } else {
            console.log('🎤 AudioRecording: No audio chunks available for processing')
          }
        },
        error: err => {
          console.error('Interval recording error:', err)
          this.updateState({
            status: `Recording error: ${err.message}`,
            isRecording: false
          })
          audioCapture.destroy()
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

      // Start early flush poller
      this.startEarlyFlushLoop(onTranscription)

      // Start watchdog that warns if no chunks are received (e.g., permission / device issue)
      const recordingStart = Date.now()
      this.noChunkWatchdog = setInterval(() => {
        if (!this.state.isRecording) return
        const elapsed = Date.now() - recordingStart
        if (this.pendingAudioChunks.length === 0 && elapsed > 5000) {
          console.warn(
            '🎤 AudioRecording: No audio chunks received after',
            elapsed,
            'ms. Check microphone permissions / device selection.'
          )
        }
      }, 2000)
    } catch (error) {
      console.error('Failed to start audio recording:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateState({
        status: `Failed to start recording: ${errorMessage}`,
        isRecording: false
      })
      this.cleanup()
    }
  }

  /**
   * Stops the interval recording
   */
  stopIntervalRecording(): void {
    if (!this.state.isRecording) {
      console.log('No recording in progress')
      return
    }

    console.log('Stopping interval recording')
    this.updateState({status: 'Stopping recording...'})

    // Flush any remaining chunks that haven't hit the interval boundary yet
    const flush = async () => {
      try {
        if (this.pendingAudioChunks.length > 0) {
          console.log(
            `🎤 AudioRecording: Manual stop flush – processing remaining ${this.pendingAudioChunks.length} chunks`
          )
          const batch = this.pendingAudioChunks.splice(0)
          // Chain with any in-flight processing to keep ordering
          if (this.processingPromise) {
            await this.processingPromise.catch(() => {})
          }

          this.processingPromise = this.processAudioChunks(batch)
          await this.processingPromise
          this.processingPromise = null
          getTranscriptionTelemetry().increment(TELEMETRY_COUNTERS.MANUAL_STOP_FLUSH)
        } else {
          console.log('🎤 AudioRecording: No pending chunks to flush on stop')
        }
      } catch (e) {
        console.error('🎤 AudioRecording: Error during manual stop flush', e)
      }
    }

    // We intentionally do not await flush here synchronously to avoid blocking UI; fire & forget with log
    void flush()

    this.cleanup()

    this.updateState({
      isRecording: false,
      recordingTime: 0,
      status: 'Ready to record'
    })

    console.log('Recording stopped')
  }

  /**
   * Toggle recording state
   */
  async toggleRecording(onTranscription?: (result: TranscriptionResult) => void): Promise<void> {
    console.log('🎤 AudioRecordingService: toggleRecording called')
    console.log('🎤 AudioRecordingService: Current state.isRecording:', this.state.isRecording)
    console.log('🎤 AudioRecordingService: onTranscription callback provided:', !!onTranscription)

    if (this.state.isRecording) {
      console.log('🎤 AudioRecordingService: Stopping recording')
      this.stopIntervalRecording()
    } else {
      console.log('🎤 AudioRecordingService: Starting recording')
      await this.startIntervalRecording(onTranscription)
    }
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

    // Do not clear pendingAudioChunks here; stopIntervalRecording handles flush then state reset

    if (this.earlyFlushTimer) {
      clearInterval(this.earlyFlushTimer)
      this.earlyFlushTimer = null
    }
    if (this.noChunkWatchdog) {
      clearInterval(this.noChunkWatchdog)
      this.noChunkWatchdog = null
    }
    this.firstPendingTimestamp = null
    this.lastChunkTimestamp = null
  }

  /**
   * Periodically checks whether we should flush early to reduce latency.
   */
  private startEarlyFlushLoop(onTranscription?: (r: TranscriptionResult) => void) {
    if (this.earlyFlushTimer) return
    this.earlyFlushTimer = setInterval(async () => {
      if (this.processingPromise || this.pendingAudioChunks.length === 0) return
      const now = Date.now()
      if (!this.firstPendingTimestamp) return
      const age = now - this.firstPendingTimestamp
      if (
        age >= AudioRecordingService.EARLY_FLUSH_MS &&
        this.pendingAudioChunks.length >= AudioRecordingService.MIN_CHUNKS_FOR_EARLY_FLUSH
      ) {
        console.log(
          `🎤 AudioRecording: Early flush after ${age}ms with ${this.pendingAudioChunks.length} chunks`
        )
        const batch = this.pendingAudioChunks.splice(0)
        this.firstPendingTimestamp = null
        try {
          this.processingPromise = this.processAudioChunks(batch, onTranscription)
          await this.processingPromise
          getTranscriptionTelemetry().increment(TELEMETRY_COUNTERS.EARLY_FLUSH)
        } finally {
          this.processingPromise = null
        }
      }
    }, AudioRecordingService.FLUSH_POLL_MS)
  }

  /**
   * Cleanup all resources (call on component unmount)
   */
  destroy(): void {
    this.cleanup()
    this.stateChangeCallbacks.length = 0
  }
}

// --- Debug exposure helper (safe no-op if imported multiple times) ---
declare global {
  interface Window {
    __TRANSCRIPTION_DEBUG?: Record<string, unknown>
  }
}

export function exposeTranscriptionDebug() {
  if (typeof window === 'undefined') return
  if (window.__TRANSCRIPTION_DEBUG) return // already exposed
  window.__TRANSCRIPTION_DEBUG = {
    intervalSeconds: INTERVAL_SECONDS,
    telemetry: () => getTranscriptionTelemetry().snapshot(),
    state: () => getAudioRecordingService().getState(),
    flushPending: async () => {
      const svc = getAudioRecordingService() as unknown as Record<string, unknown>
      const chunks = svc['pendingAudioChunks'] as AudioChunkData[] | undefined
      const proc = svc['processAudioChunks'] as
        | ((c: AudioChunkData[]) => Promise<unknown>)
        | undefined
      if (Array.isArray(chunks) && chunks.length && typeof proc === 'function') {
        const batch = chunks.splice(0)
        return proc.call(svc, batch)
      }
      return 'no-pending-chunks'
    }
  }
  console.info('🔍 Transcription debug helpers attached to window.__TRANSCRIPTION_DEBUG')
}

// Auto-expose in dev for convenience
if (process.env.NODE_ENV !== 'production') {
  try {
    exposeTranscriptionDebug()
  } catch {
    /* ignore */
  }
}

// Singleton instance for shared use
let audioRecordingServiceInstance: AudioRecordingService | null = null

/**
 * Get the singleton audio recording service instance
 */
export function getAudioRecordingService(): AudioRecordingService {
  if (!audioRecordingServiceInstance) {
    audioRecordingServiceInstance = new AudioRecordingService()
  }
  return audioRecordingServiceInstance
}
