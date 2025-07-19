import React, {useEffect, useState, useCallback, useMemo, memo} from 'react'

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

const RecordingControls: React.FC<RecordingControlsProps> = memo(({
  onTranscription,
  geminiConnection
}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isTranscribing: false,
    recordingTime: 0,
    status: 'Ready to record'
  })

  const audioService = getAudioRecordingService()

  // Log WebSocket connection status
  useEffect(() => {
    if (geminiConnection) {
      // Connection state monitoring without debug output
    }
  }, [geminiConnection?.state.connectionState, geminiConnection?.state.isStreaming])

  // Memoized transcription callback to prevent recreations
  const handleTranscription = useCallback((result: TranscriptionResult) => {
    onTranscription(result)
  }, [onTranscription])

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

  // Enhanced recording handler with quota-aware WebSocket integration
  const handleToggleRecording = async () => {
    if (!recordingState.isRecording) {
      // Starting recording

      // Only attempt WebSocket if we haven't exceeded quota recently
      if (shouldUseWebSocket && geminiConnection) {
        try {
          await geminiConnection.controls.connect()
        } catch (error) {
          console.warn(
            '🔌 Failed to connect WebSocket (likely quota), falling back to batch mode:',
            error
          )
        }
      }

      // Start audio recording (this will use batch transcription as fallback/primary)
      audioService.toggleRecording(handleTranscription)
      
      // Broadcast recording started
      window.electronWindow?.broadcast?.('recording-state-changed', true)
    } else {
      // Stopping recording

      // Stop audio recording first
      audioService.toggleRecording(handleTranscription)
      
      // Broadcast recording stopped
      window.electronWindow?.broadcast?.('recording-state-changed', false)

      // Keep WebSocket connected for potential future use (quota permitting)
    }
  }

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
              .padStart(2, '0')}:${(recordingState.recordingTime % 60).toString().padStart(2, '0')}`
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
})

RecordingControls.displayName = 'RecordingControls'

export default RecordingControls
