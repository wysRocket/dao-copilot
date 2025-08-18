/**
 * Enhanced System Audio Transcription Hook
 *
 * Integrates the working IPC transcription API with comprehensive system audio capture
 * Supports transcribing:
 * - Microphone input
 * - System audio (YouTube, Zoom, music, etc.)
 * - Mixed mode (both simultaneously)
 */

import {useEffect, useState, useCallback, useRef} from 'react'
import {
  SystemAudioCaptureService,
  AudioSourceType,
  SystemAudioConfig,
  AudioCaptureData,
  createSystemAudioCapture
} from '../services/system-audio-capture'

interface TranscriptionResult {
  text: string
  confidence?: number
  duration?: number
  source?: string
}

interface SystemTranscriptionState {
  currentText: string
  isCapturing: boolean
  isTranscribing: boolean
  sourceType: AudioSourceType
  latestResult: TranscriptionResult | null
  error: string | null
  permissionsStatus: {
    microphone: boolean
    systemAudio: boolean
    bothAvailable: boolean
  } | null
}

interface SystemTranscriptionAPI {
  transcribeAudio: (audioData: Uint8Array) => Promise<TranscriptionResult>
}

interface WindowWithSystemTranscription {
  transcriptionAPI?: SystemTranscriptionAPI
}

/**
 * Enhanced hook for system-wide audio transcription
 * Captures and transcribes both microphone and system audio
 */
export function useSystemAudioTranscription(config?: SystemAudioConfig) {
  const [state, setState] = useState<SystemTranscriptionState>({
    currentText: '',
    isCapturing: false,
    isTranscribing: false,
    sourceType: config?.sourceType || AudioSourceType.MIXED,
    latestResult: null,
    error: null,
    permissionsStatus: null
  })

  const audioServiceRef = useRef<SystemAudioCaptureService | null>(null)
  const audioBufferRef = useRef<number[]>([])
  const lastTranscribeTimeRef = useRef<number>(0)
  const transcribeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Constants for buffering and transcription timing
  const TRANSCRIBE_INTERVAL_MS = 3000 // Transcribe every 3 seconds
  const MIN_BUFFER_SIZE = 16000 // Minimum samples before transcribing
  const MAX_BUFFER_SIZE = 48000 // Maximum samples to keep in buffer

  /**
   * Initialize the system audio service
   */
  useEffect(() => {
    // Create the audio service
    audioServiceRef.current = createSystemAudioCapture(config)

    // Set up event listeners
    const audioService = audioServiceRef.current

    // Handle incoming audio data
    const handleAudioData = (...args: unknown[]) => {
      const captureData = args[0] as AudioCaptureData
      // Accumulate audio data in buffer
      audioBufferRef.current.push(...captureData.buffer)

      // Limit buffer size to prevent memory issues
      if (audioBufferRef.current.length > MAX_BUFFER_SIZE) {
        audioBufferRef.current = audioBufferRef.current.slice(-MAX_BUFFER_SIZE)
      }

      // Schedule transcription if enough data and time has passed
      const now = Date.now()
      if (
        audioBufferRef.current.length >= MIN_BUFFER_SIZE &&
        now - lastTranscribeTimeRef.current >= TRANSCRIBE_INTERVAL_MS
      ) {
        scheduleTranscription()
      }
    }

    const handleCaptureStarted = (...args: unknown[]) => {
      const sourceType = args[0] as AudioSourceType
      setState(prev => ({
        ...prev,
        isCapturing: true,
        sourceType,
        error: null
      }))
    }

    const handleCaptureStopped = () => {
      setState(prev => ({...prev, isCapturing: false}))

      // Clear any pending transcription
      if (transcribeTimeoutRef.current) {
        clearTimeout(transcribeTimeoutRef.current)
        transcribeTimeoutRef.current = null
      }
    }

    const handleCaptureError = (...args: unknown[]) => {
      const error = args[0] as Error
      setState(prev => ({
        ...prev,
        error: error.message,
        isCapturing: false,
        isTranscribing: false
      }))
    }

    const handleSourceChanged = (...args: unknown[]) => {
      const sourceType = args[0] as AudioSourceType
      setState(prev => ({...prev, sourceType}))
    }

    // Attach event listeners
    audioService.on('audioData', handleAudioData)
    audioService.on('captureStarted', handleCaptureStarted)
    audioService.on('captureStopped', handleCaptureStopped)
    audioService.on('captureError', handleCaptureError)
    audioService.on('sourceChanged', handleSourceChanged)

    // Cleanup function
    return () => {
      if (transcribeTimeoutRef.current) {
        clearTimeout(transcribeTimeoutRef.current)
      }

      audioService.off('audioData', handleAudioData)
      audioService.off('captureStarted', handleCaptureStarted)
      audioService.off('captureStopped', handleCaptureStopped)
      audioService.off('captureError', handleCaptureError)
      audioService.off('sourceChanged', handleSourceChanged)

      audioService.destroy()
      audioServiceRef.current = null
    }
  }, [config])

  /**
   * Check permissions on mount
   */
  useEffect(() => {
    const checkPermissions = async () => {
      if (audioServiceRef.current) {
        const permissions = await audioServiceRef.current.getPermissionsStatus()
        setState(prev => ({...prev, permissionsStatus: permissions}))
      }
    }

    checkPermissions()
  }, [])

  /**
   * Schedule a transcription of the current audio buffer
   */
  const scheduleTranscription = useCallback(() => {
    // Clear any existing timeout
    if (transcribeTimeoutRef.current) {
      clearTimeout(transcribeTimeoutRef.current)
    }

    // Schedule transcription with a small delay to batch audio data
    transcribeTimeoutRef.current = setTimeout(() => {
      performTranscription()
    }, 100)
  }, [])

  /**
   * Perform transcription with current audio buffer
   */
  const performTranscription = useCallback(async () => {
    const windowWithTranscription = window as WindowWithSystemTranscription

    if (!windowWithTranscription.transcriptionAPI) {
      setState(prev => ({...prev, error: 'transcriptionAPI not available'}))
      return
    }

    if (audioBufferRef.current.length === 0) {
      return
    }

    try {
      setState(prev => ({...prev, isTranscribing: true, error: null}))
      lastTranscribeTimeRef.current = Date.now()

      // Convert audio buffer to Uint8Array (simple conversion for now)
      const audioData = new Uint8Array(audioBufferRef.current.length * 4)
      for (let i = 0; i < audioBufferRef.current.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioBufferRef.current[i]))
        const intSample = Math.round(sample * 32767)

        audioData[i * 4] = intSample & 0xff
        audioData[i * 4 + 1] = (intSample >> 8) & 0xff
        audioData[i * 4 + 2] = 0
        audioData[i * 4 + 3] = 0
      }

      const result = await windowWithTranscription.transcriptionAPI.transcribeAudio(audioData)

      // Clear the transcribed portion of the buffer
      audioBufferRef.current = []

      setState(prev => ({
        ...prev,
        currentText: result.text || '',
        latestResult: {...result, source: state.sourceType},
        isTranscribing: false,
        error: null
      }))

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isTranscribing: false
      }))
    }
  }, [state.sourceType])

  /**
   * Start capturing audio for transcription
   */
  const startCapture = useCallback(async () => {
    if (!audioServiceRef.current) {
      return
    }

    try {
      await audioServiceRef.current.startCapture()
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start capture'
      }))
    }
  }, [state.sourceType])

  /**
   * Stop capturing audio
   */
  const stopCapture = useCallback(async () => {
    if (!audioServiceRef.current) {
      return
    }

    try {
      await audioServiceRef.current.stopCapture()
    } catch (error) {
      console.error('Failed to stop capture:', error)
    }
  }, [])

  /**
   * Switch audio source type
   */
  const switchSourceType = useCallback(async (sourceType: AudioSourceType) => {
    if (!audioServiceRef.current) {
      return
    }

    try {
      await audioServiceRef.current.switchSourceType(sourceType)
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to switch source'
      }))
    }
  }, [])

  return {
    // State
    currentText: state.currentText,
    isCapturing: state.isCapturing,
    isTranscribing: state.isTranscribing,
    sourceType: state.sourceType,
    latestResult: state.latestResult,
    error: state.error,
    permissionsStatus: state.permissionsStatus,
    hasText: state.currentText.length > 0,

    // Actions
    startCapture,
    stopCapture,
    switchSourceType,

    // Available options
    availableSources: [AudioSourceType.MICROPHONE, AudioSourceType.SYSTEM, AudioSourceType.MIXED]
  }
}
