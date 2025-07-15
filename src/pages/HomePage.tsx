import React, {useEffect, useCallback} from 'react'
import TranscriptDisplay from '../components/TranscriptDisplay'
import TranscriptionEventTest from '../components/TranscriptionEventTest'
import {TranscriptionResult} from '../services/main-stt-transcription'
import {useTranscriptionState} from '../hooks/useTranscriptionState'
import {getWebSocketRouter} from '../services/WebSocketTranscriptionRouter'
import {TranscriptionSource} from '../services/TranscriptionSourceManager'
import {isWebSocketTranscription} from '../utils/transcription-detection'

export default function HomePage() {
  // Use unified transcription state management
  const {
    // Current state
    state,

    // Static transcripts
    transcripts,
    isProcessing,

    // Streaming state
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingMode,

    // Actions
    startStreaming,
    updateStreaming,
    completeStreaming,
    onStreamingComplete
  } = useTranscriptionState()

  // Initialize WebSocket router
  const router = getWebSocketRouter()

  // Track processed transcripts to avoid duplicates
  const processedTranscriptIds = React.useRef<Set<string>>(new Set())

  // Handle streaming completion - add final transcript to permanent list
  const handleStreamingComplete = useCallback(() => {
    console.log('🔴 HomePage: Streaming animation completed')
    // Notify router that streaming is complete
    router.onStreamingComplete('unified-state')
  }, [router])

  // Set up streaming completion handler
  useEffect(() => {
    const unsubscribe = onStreamingComplete(handleStreamingComplete)
    return unsubscribe
  }, [handleStreamingComplete, onStreamingComplete])

  // Configure router targets
  useEffect(() => {
    // Set up streaming target for router
    router.setStreamingTarget({
      startStreamingTranscription: transcription => {
        console.log(
          '🔄 HomePage: Router requested streaming start:',
          transcription.text.substring(0, 50) + '...'
        )
        startStreaming({
          id: transcription.id,
          text: transcription.text,
          isPartial: transcription.isPartial || false,
          timestamp: transcription.timestamp,
          confidence: transcription.confidence,
          source: transcription.source
        })
      },
      updateStreamingTranscription: transcription => {
        console.log(
          '🔄 HomePage: Router requested streaming update:',
          transcription.text.substring(0, 50) + '...'
        )
        updateStreaming(transcription.text, transcription.isPartial)
      },
      completeStreamingTranscription: transcription => {
        console.log(
          '🔄 HomePage: Router requested streaming completion:',
          transcription.text.substring(0, 50) + '...'
        )
        completeStreaming()
      },
      isStreamingActive: isStreamingActive,
      currentStreamingSource: state.streaming.current?.source
    })

    // Set up static target for router
    router.setStaticTarget({
      addStaticTranscription: transcription => {
        console.log(
          '🔄 HomePage: Router requested static add:',
          transcription.text.substring(0, 50) + '...'
        )
        // This would be handled by the shared state system
      },
      appendToLastTranscription: text => {
        console.log('🔄 HomePage: Router requested append:', text.substring(0, 50) + '...')
        // Append functionality can be added later if needed
      },
      updateTranscription: id => {
        console.log('🔄 HomePage: Router requested update for:', id)
        // Update functionality can be added later if needed
      }
    })
  }, [
    router,
    startStreaming,
    updateStreaming,
    completeStreaming,
    isStreamingActive,
    handleStreamingComplete,
    state.streaming.current?.source
  ])

  // Watch for new transcriptions and route them appropriately
  useEffect(() => {
    if (transcripts.length > 0) {
      const latestTranscript = transcripts[transcripts.length - 1]

      // Check if this is a new transcript that hasn't been processed
      if (
        latestTranscript.id &&
        !processedTranscriptIds.current.has(latestTranscript.id) &&
        latestTranscript.text &&
        latestTranscript.text.length > 2 // Only process meaningful text
      ) {
        console.log(
          '🔴 HomePage: New transcript detected:',
          latestTranscript.text.substring(0, 50) + '...'
        )
        console.log('🔴 HomePage: Transcript source:', latestTranscript.source)

        // Mark as processed
        processedTranscriptIds.current.add(latestTranscript.id)

        // Check if it's a WebSocket transcription using detection utility
        const isWebSocketSource = isWebSocketTranscription(latestTranscript.source)
        console.log('🔴 HomePage: Is WebSocket source:', isWebSocketSource)

        if (isWebSocketSource) {
          // Convert to TranscriptionWithSource format for router
          const transcriptionWithSource = {
            id: latestTranscript.id,
            text: latestTranscript.text,
            timestamp: latestTranscript.timestamp,
            confidence: latestTranscript.confidence,
            source: TranscriptionSource.WEBSOCKET_GEMINI,
            isPartial: false
          }

          // Route through WebSocket router
          console.log('🔄 HomePage: Routing WebSocket transcription through router')
          const decision = router.routeTranscription(transcriptionWithSource)
          console.log('🔄 HomePage: Router decision:', decision)
        } else {
          console.log('🔴 HomePage: Non-WebSocket transcription, handling normally')
        }
      }
    }
  }, [transcripts, router])

  // Debug: Log when transcripts change
  useEffect(() => {
    console.log('🏠 HomePage: Transcripts updated:', transcripts.length, 'transcripts')
    console.log('🏠 HomePage: Processing state:', isProcessing)
    console.log(
      '🏠 HomePage: Streaming active (unified):',
      isStreamingActive,
      'text:',
      currentStreamingText.substring(0, 50) + '...'
    )
    console.log('🏠 HomePage: Streaming partial:', isCurrentTextPartial, 'mode:', streamingMode)
  }, [
    transcripts,
    isProcessing,
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    streamingMode
  ])

  // Use unified streaming state
  const effectiveStreamingActive = isStreamingActive
  const effectiveStreamingText = currentStreamingText

  // Convert shared state transcripts to TranscriptionResult format (exclude the one being streamed)
  const staticTranscripts: TranscriptionResult[] = transcripts
    .filter(transcript => {
      // Don't show WebSocket transcriptions in static display if they're being streamed
      if (effectiveStreamingActive && isWebSocketTranscription(transcript.source)) {
        return false
      }
      return true
    })
    .map(transcript => ({
      text: transcript.text,
      confidence: transcript.confidence,
      timestamp: transcript.timestamp,
      duration: 0,
      startTime: 0,
      endTime: 0,
      source: transcript.source
    }))

  console.log(
    '🏠 HomePage: Rendering with',
    staticTranscripts.length,
    'static transcripts, streaming active:',
    effectiveStreamingActive
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex w-full flex-1 flex-col items-center justify-center p-8">
        {/* Debug: Transcription Event Test Component */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mb-6 w-full max-w-4xl">
            <TranscriptionEventTest />
          </div>
        )}

        {/* Live Transcript Display with Streaming Support */}
        <div className="flex w-full justify-center">
          <TranscriptDisplay
            transcripts={staticTranscripts}
            isProcessing={isProcessing}
            autoScroll={true}
            showScrollToBottom={true}
            // Enable streaming text renderer
            enableStreaming={effectiveStreamingActive}
            streamingText={effectiveStreamingText}
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
