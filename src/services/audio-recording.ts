import {Subject, Subscription, interval} from 'rxjs'
import {buffer, takeUntil} from 'rxjs/operators'
import {audio_stream} from './audio_capture'
import {renderWavFile} from './wav'

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
  toggleRecording(onTranscription?: (result: TranscriptionResult) => void): void {
    if (this.state.isRecording) {
      this.stopIntervalRecording()
    } else {
      this.startIntervalRecording(onTranscription)
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
