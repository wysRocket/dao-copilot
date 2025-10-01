import React, {useEffect, useState, useCallback, useMemo, memo, useRef} from 'react'

// Services and types
import {
  getAudioRecordingService,
  TranscriptionResult,
  RecordingState
} from '../services/audio-recording'

// Hooks and connection types
import {GeminiConnectionState, GeminiConnectionControls} from '../hooks/useGeminiConnection'

interface RecordingControlsProps {
  onTranscription: (transcript: TranscriptionResult) => void
  geminiConnection?: {
    state: GeminiConnectionState
    controls: GeminiConnectionControls
  }
}

const RecordingControls: React.FC<RecordingControlsProps> = memo(
  ({onTranscription, geminiConnection}) => {
    const [recordingState, setRecordingState] = useState<RecordingState>({
      isRecording: false,
      isTranscribing: false,
      recordingTime: 0,
      status: 'Ready to record'
    })

    // Debouncing to prevent multiple rapid clicks
    const lastClickTimeRef = useRef<number>(0)
    const DEBOUNCE_MS = 500 // Prevent clicks within 500ms

    const audioService = getAudioRecordingService()

    // Log WebSocket connection status
    useEffect(() => {
      if (geminiConnection) {
        // Connection state monitoring without debug output
      }
    }, [geminiConnection?.state.connectionState, geminiConnection?.state.isStreaming])

    // Memoized transcription callback to prevent recreations
    const handleTranscription = useCallback(
      (result: TranscriptionResult) => {
        onTranscription(result)
      },
      [onTranscription]
    )

    // Memoized WebSocket availability check
    const shouldUseWebSocket = useMemo(() => {
      return (
        geminiConnection &&
        geminiConnection.state.connectionState !== 'error' &&
        geminiConnection.state.errors < 3
      )
    }, [geminiConnection?.state.connectionState, geminiConnection?.state.errors])

    // Subscribe to recording state changes
    useEffect(() => {
      const unsubscribe = audioService.onStateChange(newState => {
        setRecordingState(newState)
      })

      // Initialize with current state
      setRecordingState(audioService.getState())

      // Cleanup on unmount
      return () => {
        unsubscribe()
        audioService.destroy()
      }
    }, [audioService])

    // Enhanced recording handler with parallel WebSocket integration and debouncing
    const handleToggleRecording = useCallback(async () => {
      // Debounce rapid clicks
      const now = Date.now()
      if (now - lastClickTimeRef.current < DEBOUNCE_MS) {
        console.log('🚫 Click debounced - too fast')
        return
      }
      lastClickTimeRef.current = now

      if (!recordingState.isRecording) {
        // Starting recording - START IMMEDIATELY with optimistic UI
        console.log('🔴 Starting recording with immediate response')

        // Broadcast recording started IMMEDIATELY for instant UI feedback
        window.electronWindow?.broadcast?.('recording-state-changed', true)

        // Start audio recording IMMEDIATELY (don't wait for WebSocket)
        audioService.toggleRecording(handleTranscription)

        // WebSocket connection in PARALLEL (non-blocking)
        if (shouldUseWebSocket && geminiConnection) {
          // Start WebSocket connection in background without awaiting
          geminiConnection.controls
            .connect()
            .then(() => {
              console.log('🔌 WebSocket connected successfully after recording start')
            })
            .catch(error => {
              console.warn(
                '🔌 WebSocket connection failed (quota/network), continuing with audio-only:',
                error
              )
            })
        }
      } else {
        // Stopping recording
        console.log('⏹️ Stopping recording')

        // Stop audio recording first
        audioService.toggleRecording(handleTranscription)

        // Broadcast recording stopped
        window.electronWindow?.broadcast?.('recording-state-changed', false)

        // Keep WebSocket connected for potential future use (quota permitting)
      }
    }, [
      recordingState.isRecording,
      shouldUseWebSocket,
      geminiConnection,
      audioService,
      handleTranscription
    ])

    return (
      <>
        <button
          onClick={handleToggleRecording}
          className="record-btn app-region-no-drag mr-2 border-none bg-none p-0 transition-opacity hover:opacity-80"
          style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
          title={recordingState.isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="8"
              cy="8"
              r="8"
              fill={recordingState.isRecording ? '#ef4444' : '#2563eb'}
              className={recordingState.isRecording ? 'animate-pulse' : ''}
            />
            {recordingState.isRecording ? (
              <rect x="6" y="6" width="4" height="4" fill="white" />
            ) : (
              <rect x="6" y="4" width="4" height="8" rx="2" fill="white" />
            )}
          </svg>
        </button>
        <span
          className={`mr-4 text-base transition-colors duration-200 ${
            recordingState.isRecording ? 'font-semibold' : ''
          }`}
          style={{
            color: recordingState.isRecording ? 'var(--interactive-danger)' : 'var(--text-primary)'
          }}
        >
          {recordingState.isRecording || recordingState.recordingTime > 0
            ? `${Math.floor(recordingState.recordingTime / 60)
                .toString()
                .padStart(
                  2,
                  '0'
                )}:${(recordingState.recordingTime % 60).toString().padStart(2, '0')}`
            : '00:00'}
          {recordingState.isTranscribing && (
            <span
              className="ml-2 animate-pulse text-xs"
              style={{color: 'var(--interactive-primary)'}}
            >
              Processing...
            </span>
          )}
        </span>
      </>
    )
  }
)

RecordingControls.displayName = 'RecordingControls'

export default RecordingControls
