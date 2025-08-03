import React from 'react'
import TranscriptDisplay from '../components/TranscriptDisplay'
import TranscriptionEventTest from '../components/TranscriptionEventTest'
import RecordingControls from '../components/RecordingControls'
import {useTranscriptionState} from '../hooks/useTranscriptionState'

export default function HomePage() {
  // Use unified transcription state management - only for completed transcripts
  const {
    // Static transcripts
    transcripts,
    isProcessing,

    // Actions for recording controls
    addTranscript
  } = useTranscriptionState()

  // Convert TranscriptionStateManager.TranscriptionResult to main-stt-transcription.TranscriptionResult
  const convertedTranscripts = transcripts.map(transcript => ({
    ...transcript,
    duration: transcript.duration || 0 // Ensure duration is always a number
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col p-8">
        {/* Recording Controls - Main interface for starting/stopping recording */}
        <div className="mb-6">
          <RecordingControls 
            onTranscription={addTranscript}
          />
        </div>

        {/* Main Transcript Display - Shows completed transcripts only */}
        <div className="mb-8 flex-1">
          <TranscriptDisplay
            transcripts={convertedTranscripts}
            isProcessing={isProcessing}
            enableStreaming={false}
            streamingText=""
            isStreamingPartial={false}
            isStreamingActive={false}
            streamingMode="character"
            onStreamingComplete={() => {}}
            autoScroll={true}
            showScrollToBottom={true}
          />
        </div>

        {/* Transcription Event Test Component for debugging */}
        <div className="mt-4">
          <TranscriptionEventTest />
        </div>
      </div>
    </div>
  )
}
