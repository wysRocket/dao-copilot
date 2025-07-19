import React from 'react'
import TranscriptDisplay from '../components/TranscriptDisplay'
import TranscriptionEventTest from '../components/TranscriptionEventTest'
import {useTranscriptionState} from '../hooks/useTranscriptionState'

export default function HomePage() {
  // Use unified transcription state management
  const {
    // Static transcripts
    transcripts,
    isProcessing,

    // Streaming state
    currentStreamingText,
    isCurrentTextPartial,
    isStreamingActive,
    streamingMode,

    // Actions
    completeStreaming
  } = useTranscriptionState()

  // Convert TranscriptionStateManager.TranscriptionResult to main-stt-transcription.TranscriptionResult
  const convertedTranscripts = transcripts.map(transcript => ({
    ...transcript,
    duration: transcript.duration || 0 // Ensure duration is always a number
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col p-8">
        {/* Main Transcript Display */}
        <div className="mb-8 flex-1">
          <TranscriptDisplay
            transcripts={convertedTranscripts}
            isProcessing={isProcessing}
            enableStreaming={true}
            streamingText={currentStreamingText}
            isStreamingPartial={isCurrentTextPartial}
            isStreamingActive={isStreamingActive}
            streamingMode={streamingMode}
            onStreamingComplete={completeStreaming}
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
