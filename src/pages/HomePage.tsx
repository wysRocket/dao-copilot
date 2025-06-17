import React from 'react'
import TestGlassComponent from '../components/TestGlassComponent'
import TranscriptDisplay from '../components/TranscriptDisplay'
import ToggleTheme from '../components/ToggleTheme'
import { TranscriptionResult } from '../services/main-stt-transcription'

// Sample transcript data for demonstration
const sampleTranscripts: TranscriptionResult[] = [
  {
    text: "Hello, this is a test of the glass transcript display component.",
    startTime: 0.0,
    endTime: 3.2,
    confidence: 0.95,
    timestamp: Date.now() - 10000
  },
  {
    text: "The glassmorphism effects create a beautiful, modern interface that adapts to the current theme.",
    startTime: 3.5,
    endTime: 8.1,
    confidence: 0.87,
    timestamp: Date.now() - 5000
  },
  {
    text: "Each message bubble has subtle glass effects with smooth animations.",
    startTime: 8.5,
    endTime: 11.8,
    confidence: 0.92,
    timestamp: Date.now() - 2000
  }
]

export default function HomePage() {
  return (
    <div className="flex h-full flex-col">
      {/* Theme toggle for testing */}
      <div className="absolute top-4 right-4 z-10">
        <ToggleTheme />
      </div>
      
      <div className="flex flex-1 flex-col items-center justify-center p-8 space-y-8">
        <div className="space-y-4 text-center max-w-4xl w-full">
          <TestGlassComponent title="DAO Copilot - Glass UI Integration">
            <p>This demonstrates the liquid-glass-react integration working successfully!</p>
            <div className="mt-2 text-xs opacity-75">
              Build configuration updated and component rendered without issues.
            </div>
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
              <p className="text-sm text-foreground">Theme system is now active!</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the toggle button above to switch between light and dark themes.
              </p>
            </div>
          </TestGlassComponent>
          
          {/* Enhanced Transcript Display Demo */}
          <div className="w-full">
            <TranscriptDisplay
              transcripts={sampleTranscripts}
              isProcessing={false}
              autoScroll={true}
              showScrollToBottom={true}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
