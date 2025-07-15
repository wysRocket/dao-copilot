import {Subject, Subscription, interval} from 'rxjs'
import {takeUntil} from 'rxjs/operators'
import {getAudioCapture, type AudioChunkData} from './audio-capture-factory'
import {renderWavFile} from './wav'
import {sanitizeLogMessage} from './log-sanitizer'

// Constants
export const INTERVAL_SECONDS = 10
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
  source?: string  // Add source information
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
        console.log('🎤 AudioRecording: Calling transcriptionAPI.transcribeAudio with', wavData.length, 'bytes')
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

        if (onTranscription && result?.text?.trim()) {
          console.log('🎤 AudioRecording: ✅ CALLING onTranscription callback with result')
          onTranscription(result)
          console.log('🎤 AudioRecording: ✅ onTranscription callback completed successfully')
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

      // Set up audio chunk collection
      const audioChunks: AudioChunkData[] = []
      audioCapture.on('audioChunk', (chunkData: AudioChunkData) => {
        console.log('🎤 AudioRecording: Audio chunk received, size:', chunkData.buffer.length)
        audioChunks.push(chunkData)
        console.log('🎤 AudioRecording: Total chunks collected:', audioChunks.length)
      })

      // Set up interval processing
      const intervalObservable = interval(INTERVAL_SECONDS * 1000)

      this.recordingSubscription = intervalObservable.pipe(takeUntil(stopSubject)).subscribe({
        next: async () => {
          console.log('🎤 AudioRecording: Interval triggered, checking for audio chunks')
          console.log('🎤 AudioRecording: audioChunks.length:', audioChunks.length)
          if (audioChunks.length > 0) {
            console.log(`🎤 AudioRecording: Processing ${audioChunks.length} audio chunks for interval transcription`)
            console.log('🎤 AudioRecording: onTranscription callback provided:', !!onTranscription)
            await this.processAudioChunks(audioChunks.splice(0), onTranscription)
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
  }

  /**
   * Cleanup all resources (call on component unmount)
   */
  destroy(): void {
    this.cleanup()
    this.stateChangeCallbacks.length = 0
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
