import React, {useEffect, useCallback} from 'react'
import TranscriptDisplay from '../components/TranscriptDisplay'
import {TranscriptionResult} from '../services/main-stt-transcription'
import {useSharedState} from '../hooks/useSharedState'
import {useStreamingText} from '../contexts/StreamingTextContext'

export default function HomePage() {
  // Use live transcription data from shared state
  const {transcripts, isProcessing} = useSharedState()
  
  // Use streaming text context for live rendering
  const {
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    startStreamingTranscription,
    streamingMode,
    setOnStreamingComplete
  } = useStreamingText()

  // Track processed transcripts to avoid duplicates
  const processedTranscriptIds = React.useRef<Set<string>>(new Set())

  // Handle streaming completion - add final transcript to permanent list
  const handleStreamingComplete = useCallback(() => {
    console.log('🔴 HomePage: Streaming animation completed')
  }, [])

  // Set up streaming completion handler
  useEffect(() => {
    setOnStreamingComplete(handleStreamingComplete)
  }, [handleStreamingComplete, setOnStreamingComplete])

  // Watch for new WebSocket transcriptions and route them through streaming
  useEffect(() => {
    if (transcripts.length > 0) {
      const latestTranscript = transcripts[transcripts.length - 1]
      
      // Check if this is a new WebSocket transcript that hasn't been processed
      if (
        latestTranscript.id &&
        !processedTranscriptIds.current.has(latestTranscript.id) &&
        latestTranscript.text &&
        latestTranscript.text.length > 2 // Only process meaningful text
      ) {
        console.log('🔴 HomePage: New transcript detected, checking for streaming:', latestTranscript.text.substring(0, 50) + '...')
        
        // Mark as processed
        processedTranscriptIds.current.add(latestTranscript.id)
        
        // Start streaming this transcription
        startStreamingTranscription({
          id: latestTranscript.id,
          text: latestTranscript.text,
          isPartial: false, // Since it's already completed
          timestamp: latestTranscript.timestamp,
          confidence: latestTranscript.confidence,
          source: 'websocket-gemini' // Assume WebSocket source for streaming
        })
      }
    }
  }, [transcripts, startStreamingTranscription])

  // Debug: Log when transcripts change
  useEffect(() => {
    console.log('🏠 HomePage: Transcripts updated:', transcripts.length, 'transcripts')
    console.log('🏠 HomePage: Processing state:', isProcessing)
    console.log('🏠 HomePage: Streaming active:', isStreamingActive, 'text:', currentStreamingText.substring(0, 50) + '...')
  }, [transcripts, isProcessing, isStreamingActive, currentStreamingText])

  // Convert shared state transcripts to TranscriptionResult format (exclude the one being streamed)
  const staticTranscripts: TranscriptionResult[] = transcripts
    .filter(transcript => !isStreamingActive || transcript.id !== transcripts[transcripts.length - 1]?.id)
    .map(transcript => ({
      text: transcript.text,
      confidence: transcript.confidence,
      timestamp: transcript.timestamp,
      duration: 0,
      startTime: 0,
      endTime: 0
    }))

  console.log('🏠 HomePage: Rendering with', staticTranscripts.length, 'static transcripts, streaming active:', isStreamingActive)

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col items-center justify-center p-8">
        {/* Live Transcript Display with Streaming Support */}
        <div className="flex w-full justify-center">
          <TranscriptDisplay
            transcripts={staticTranscripts}
            isProcessing={isProcessing}
            autoScroll={true}
            showScrollToBottom={true}
            // Enable streaming text renderer
            enableStreaming={isStreamingActive}
            streamingText={currentStreamingText}
            isStreamingPartial={isCurrentTextPartial}
            streamingMode={streamingMode}
            onStreamingComplete={handleStreamingComplete}
            // Enhanced accessibility
            accessibilityConfig={{
              enabled: true,
              announceChanges: true,
              verboseStatus: false,
              enableKeyboardControls: true,
              announcementPriority: 'medium'
            }}
          />
        </div>
      </div>
    </div>
  )
}
