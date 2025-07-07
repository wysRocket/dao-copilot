import {Subject, Subscription, interval} from 'rxjs'
import {buffer, takeUntil} from 'rxjs/operators'
import {audio_stream} from './audio_capture'
import {renderWavFile} from './wav'

// Constants
export const INTERVAL_SECONDS = 10
export const TARGET_SAMPLE_RATE = 8000
export const DEVICE_SAMPLE_RATE = 44100

// Streaming constants
export const STREAMING_CHUNK_SIZE = 1024 // Samples per chunk for real-time streaming
export const STREAMING_INTERVAL_MS = 100 // Milliseconds between streaming chunks

/**
 * Transcription result interface
 */
export interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  timestamp?: number
  isPartial?: boolean
  isFinal?: boolean
}

/**
 * Recording mode enumeration
 */
export enum RecordingMode {
  INTERVAL = 'interval',
  STREAMING = 'streaming',
  HYBRID = 'hybrid'
}

/**
 * Recording state interface
 */
export interface RecordingState {
  isRecording: boolean
  isTranscribing: boolean
  isStreaming: boolean
  recordingTime: number
  status: string
  mode: RecordingMode
  bufferHealth?: number
  latency?: number
}

/**
 * Audio chunk interface for streaming
 */
export interface AudioChunk {
  data: Float32Array
  timestamp: number
  sampleRate: number
  channels: number
}

/**
 * Streaming callback interface
 */
export interface StreamingCallbacks {
  onAudioChunk?: (chunk: AudioChunk) => void
  onTranscription?: (result: TranscriptionResult) => void
  onError?: (error: Error) => void
  onStateChange?: (state: RecordingState) => void
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
 * Manages audio recording, processing, and transcription with support for both
 * interval-based recording and real-time streaming modes.
 */
export class AudioRecordingService {
  private recordingSubscription: Subscription | null = null
  private streamingSubscription: Subscription | null = null
  private stopSubject: Subject<void> | null = null
  private timerInterval: NodeJS.Timeout | null = null
  private audioBuffer: Float32Array[] = []
  private streamingCallbacks?: StreamingCallbacks

  private state: RecordingState = {
    isRecording: false,
    isTranscribing: false,
    isStreaming: false,
    recordingTime: 0,
    status: 'Ready to record',
    mode: RecordingMode.INTERVAL,
    bufferHealth: 1.0,
    latency: 0
  }

  private stateChangeCallbacks: Array<(state: RecordingState) => void> = []

  /**
   * Set recording mode
   */
  setMode(mode: RecordingMode): void {
    if (this.state.isRecording) {
      console.warn('Cannot change mode while recording is active')
      return
    }

    this.updateState({
      mode,
      status: `Mode set to ${mode}`
    })
  }

  /**
   * Get current recording mode
   */
  getMode(): RecordingMode {
    return this.state.mode
  }

  /**
   * Check if streaming mode is active
   */
  isStreamingMode(): boolean {
    return this.state.mode === RecordingMode.STREAMING || this.state.mode === RecordingMode.HYBRID
  }

  /**
   * Set streaming callbacks
   */
  setStreamingCallbacks(callbacks: StreamingCallbacks): void {
    this.streamingCallbacks = callbacks
  }

  /**
   * Clear streaming callbacks
   */
  clearStreamingCallbacks(): void {
    this.streamingCallbacks = undefined
  }
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

    // Notify streaming callbacks if available
    if (this.streamingCallbacks?.onStateChange) {
      this.streamingCallbacks.onStateChange(this.state)
    }
  }

  /**
   * Get current state
   */
  getState(): RecordingState {
    return {...this.state}
  }

  /**
   * Process a single audio chunk for streaming
   */
  private processStreamingChunk(audioData: number[]): void {
    if (!this.isStreamingMode() || !this.streamingCallbacks?.onAudioChunk) {
      return
    }

    try {
      const timestamp = Date.now()
      const float32Data = new Float32Array(audioData)

      // Resample if needed
      const resampledData = resampleAudio(float32Data, DEVICE_SAMPLE_RATE, TARGET_SAMPLE_RATE)

      const chunk: AudioChunk = {
        data: resampledData,
        timestamp,
        sampleRate: TARGET_SAMPLE_RATE,
        channels: 1
      }

      // Calculate buffer health (simplified)
      const bufferHealth = Math.min(1.0, this.audioBuffer.length / 10)
      this.updateState({bufferHealth})

      this.streamingCallbacks.onAudioChunk(chunk)
    } catch (error) {
      console.error('Error processing streaming chunk:', error)
      if (this.streamingCallbacks?.onError) {
        this.streamingCallbacks.onError(error as Error)
      }
    }
  }

  /**
   * Start real-time audio streaming
   */
  startStreaming(callbacks?: StreamingCallbacks): void {
    if (this.state.isStreaming) {
      console.log('Streaming already in progress')
      return
    }

    if (callbacks) {
      this.setStreamingCallbacks(callbacks)
    }

    this.updateState({
      isStreaming: true,
      isRecording: true,
      recordingTime: 0,
      status: 'Streaming audio...',
      mode: this.state.mode === RecordingMode.INTERVAL ? RecordingMode.HYBRID : this.state.mode
    })

    // Start timer for recording time
    this.timerInterval = setInterval(() => {
      this.updateState({recordingTime: this.state.recordingTime + 1})
    }, 1000)

    console.log('Starting real-time audio streaming')

    // Create stop subject
    const stopSubject = new Subject<void>()
    this.stopSubject = stopSubject

    // Start the audio stream with smaller chunks for real-time processing
    const audioObservable = audio_stream()

    // Subscribe to audio stream for real-time processing
    this.streamingSubscription = audioObservable.pipe(takeUntil(stopSubject)).subscribe({
      next: (audioData: number[]) => {
        // Buffer the audio data
        this.audioBuffer.push(new Float32Array(audioData))

        // Process chunks of appropriate size for streaming
        this.processStreamingChunk(audioData)

        // Keep buffer size manageable
        if (this.audioBuffer.length > 100) {
          this.audioBuffer = this.audioBuffer.slice(-50)
        }
      },
      error: err => {
        console.error('Streaming error:', err)
        this.updateState({
          status: `Streaming error: ${err.message}`,
          isStreaming: false,
          isRecording: false
        })

        if (this.streamingCallbacks?.onError) {
          this.streamingCallbacks.onError(err)
        }

        this.cleanup()
      },
      complete: () => {
        console.log('Streaming completed')
        this.updateState({
          isStreaming: false,
          isRecording: false,
          status: 'Ready to record'
        })
      }
    })
  }

  /**
   * Stop audio streaming
   */
  stopStreaming(): void {
    if (!this.state.isStreaming) {
      console.log('No streaming in progress')
      return
    }

    console.log('Stopping audio streaming')
    this.updateState({status: 'Stopping streaming...'})

    // Stop streaming subscription
    if (this.streamingSubscription) {
      this.streamingSubscription.unsubscribe()
      this.streamingSubscription = null
    }

    // Clear audio buffer
    this.audioBuffer = []

    this.cleanup()

    this.updateState({
      isStreaming: false,
      isRecording: false,
      recordingTime: 0,
      status: 'Ready to record',
      mode: this.state.mode === RecordingMode.HYBRID ? RecordingMode.INTERVAL : this.state.mode
    })

    console.log('Streaming stopped')
  }

  /**
   * Processes a chunk of audio data by converting it to WAV and sending for transcription
   */
  async processAudioChunk(
    chunks: number[][],
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

      // Combine all chunks into a single array
      const combinedAudio = chunks.flat()
      if (combinedAudio.length === 0) {
        console.log('Combined audio is empty')
        return null
      }

      console.log(`Processing ${combinedAudio.length} audio samples`)

      // Convert to Float32Array for processing
      const audioData = new Float32Array(combinedAudio)

      // Resample from device sample rate to target sample rate
      const resampledAudio = resampleAudio(audioData, DEVICE_SAMPLE_RATE, TARGET_SAMPLE_RATE)

      console.log(`Resampled audio from ${audioData.length} to ${resampledAudio.length} samples`)

      // Convert to WAV format
      const wavData = await renderAudioToWav(resampledAudio)
      console.log(`Generated WAV file: ${wavData.length} bytes`)

      // Send for transcription via IPC
      if (window.transcriptionAPI?.transcribeAudio) {
        const result = await window.transcriptionAPI.transcribeAudio(wavData)
        console.log('Transcription result:', result)

        if (onTranscription && result.text.trim()) {
          onTranscription(result)
        }

        return result
      } else {
        console.error('Transcription IPC not available')
        return null
      }
    } catch (error) {
      console.error('Error processing audio chunk:', error)
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
   * Starts recording audio in intervals
   */
  startIntervalRecording(onTranscription?: (result: TranscriptionResult) => void): void {
    if (this.state.isRecording && !this.state.isStreaming) {
      console.log('Interval recording already in progress')
      return
    }

    this.updateState({
      isRecording: true,
      recordingTime: 0,
      status: `Recording... (${INTERVAL_SECONDS}s intervals)`,
      mode: this.state.mode === RecordingMode.STREAMING ? RecordingMode.HYBRID : this.state.mode
    })

    // Start timer for recording time if not already running
    if (!this.timerInterval) {
      this.timerInterval = setInterval(() => {
        this.updateState({recordingTime: this.state.recordingTime + 1})
      }, 1000)
    }

    console.log(`Starting interval recording (${INTERVAL_SECONDS} second intervals)`)

    // Create a subject that will emit when recording should stop
    const stopSubject = new Subject<void>()
    this.stopSubject = stopSubject

    // Create an interval observable that emits every INTERVAL_SECONDS
    const intervalObservable = interval(INTERVAL_SECONDS * 1000)

    // Start the audio stream
    const audioObservable = audio_stream()

    // Subscribe to the audio stream and process chunks at intervals
    this.recordingSubscription = audioObservable
      .pipe(buffer(intervalObservable), takeUntil(stopSubject))
      .subscribe({
        next: async chunks => {
          console.log(`Received ${chunks.length} audio chunks for processing`)
          await this.processAudioChunk(chunks, onTranscription)
        },
        error: err => {
          console.error('Recording error:', err)
          this.updateState({
            status: `Recording error: ${err.message}`,
            isRecording: false
          })
          this.cleanup()
        },
        complete: () => {
          console.log('Recording stream completed')
          this.updateState({
            isRecording: false,
            status: 'Ready to record'
          })
        }
      })
  }

  /**
   * Stops the interval recording
   */
  stopIntervalRecording(): void {
    if (!this.state.isRecording || this.state.isStreaming) {
      console.log('No interval recording in progress')
      return
    }

    console.log('Stopping interval recording')
    this.updateState({status: 'Stopping recording...'})

    // Only cleanup interval recording, not streaming
    if (this.recordingSubscription) {
      this.recordingSubscription.unsubscribe()
      this.recordingSubscription = null
    }

    if (this.stopSubject && !this.state.isStreaming) {
      this.stopSubject.next()
      this.stopSubject.complete()
      this.stopSubject = null
    }

    if (this.timerInterval && !this.state.isStreaming) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }

    this.updateState({
      isRecording: this.state.isStreaming, // Keep recording true if streaming
      recordingTime: this.state.isStreaming ? this.state.recordingTime : 0,
      status: this.state.isStreaming ? 'Streaming audio...' : 'Ready to record',
      mode: this.state.mode === RecordingMode.HYBRID ? RecordingMode.STREAMING : this.state.mode
    })

    console.log('Interval recording stopped')
  }

  /**
   * Toggle recording state (interval mode)
   */
  toggleRecording(onTranscription?: (result: TranscriptionResult) => void): void {
    if (this.state.isRecording && !this.state.isStreaming) {
      this.stopIntervalRecording()
    } else if (!this.state.isRecording) {
      this.startIntervalRecording(onTranscription)
    }
  }

  /**
   * Toggle streaming state
   */
  toggleStreaming(callbacks?: StreamingCallbacks): void {
    if (this.state.isStreaming) {
      this.stopStreaming()
    } else {
      this.startStreaming(callbacks)
    }
  }

  /**
   * Start recording based on current mode
   */
  startRecording(options?: {
    onTranscription?: (result: TranscriptionResult) => void
    streamingCallbacks?: StreamingCallbacks
  }): void {
    const {onTranscription, streamingCallbacks} = options || {}

    switch (this.state.mode) {
      case RecordingMode.INTERVAL:
        this.startIntervalRecording(onTranscription)
        break
      case RecordingMode.STREAMING:
        this.startStreaming(streamingCallbacks)
        break
      case RecordingMode.HYBRID:
        this.startIntervalRecording(onTranscription)
        this.startStreaming(streamingCallbacks)
        break
    }
  }

  /**
   * Stop all recording
   */
  stopRecording(): void {
    if (this.state.isStreaming) {
      this.stopStreaming()
    }
    if (this.state.isRecording) {
      this.stopIntervalRecording()
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    // Stop timer only if not in streaming mode
    if (this.timerInterval && !this.state.isStreaming) {
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

    // Unsubscribe from streaming subscription
    if (this.streamingSubscription) {
      this.streamingSubscription.unsubscribe()
      this.streamingSubscription = null
    }
  }

  /**
   * Cleanup all resources (call on component unmount)
   */
  destroy(): void {
    this.cleanup()
    this.stateChangeCallbacks.length = 0
    this.audioBuffer = []
    this.streamingCallbacks = undefined

    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  /**
   * Get audio buffer health (0-1)
   */
  getBufferHealth(): number {
    return this.state.bufferHealth || 1.0
  }

  /**
   * Get current latency estimate (ms)
   */
  getLatency(): number {
    return this.state.latency || 0
  }

  /**
   * Get buffered audio data (for analysis or fallback)
   */
  getBufferedAudio(): Float32Array[] {
    return [...this.audioBuffer]
  }

  /**
   * Clear audio buffer
   */
  clearBuffer(): void {
    this.audioBuffer = []
    this.updateState({bufferHealth: 1.0})
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
