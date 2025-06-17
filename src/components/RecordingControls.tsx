import React, {useEffect, useState} from 'react'

import {
  getAudioRecordingService,
  TranscriptionResult,
  RecordingState
} from '../services/audio-recording'

interface RecordingControlsProps {
  onTranscription: (transcript: TranscriptionResult) => void
}

const RecordingControls: React.FC<RecordingControlsProps> = ({onTranscription}) => {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isTranscribing: false,
    recordingTime: 0,
    status: 'Ready to record'
  })

  const audioService = getAudioRecordingService()

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

  return (
    <>
      <button
        onClick={() => audioService.toggleRecording(onTranscription)}
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
          color: recordingState.isRecording 
            ? 'var(--interactive-danger)' 
            : 'var(--text-primary)'
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
            style={{ color: 'var(--interactive-primary)' }}
          >
            Processing...
          </span>
        )}
      </span>
    </>
  )
}

export default RecordingControls
