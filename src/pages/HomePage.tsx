import React from 'react'
import TranscriptDisplay from '../components/TranscriptDisplay'
import {TranscriptionResult} from '../services/main-stt-transcription'

// Sample transcript data for demonstration
const sampleTranscripts: TranscriptionResult[] = [
  {
    text: 'Hello, this is a test of the glass transcript display component.',
    startTime: 0.0,
    endTime: 3.2,
    confidence: 0.95,
    timestamp: Date.now() - 10000,
    duration: 100
  },
  {
    text: 'The glassmorphism effects create a beautiful, modern interface that adapts to the current theme.',
    startTime: 3.5,
    endTime: 8.1,
    confidence: 0.87,
    timestamp: Date.now() - 5000,
    duration: 120
  },
  {
    text: 'Each message bubble has subtle glass effects with smooth animations.',
    startTime: 8.5,
    endTime: 11.8,
    confidence: 0.92,
    timestamp: Date.now() - 2000,
    duration: 90
  }
]

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col items-center justify-center p-8">
        {/* Enhanced Transcript Display Demo */}
        <div className="flex w-full justify-center">
          <TranscriptDisplay
            transcripts={sampleTranscripts}
            isProcessing={false}
            autoScroll={true}
            showScrollToBottom={true}
          />
        </div>
      </div>
    </div>
  )
}
