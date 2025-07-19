import React, {useEffect, useRef, useCallback, useMemo} from 'react'

// Local hooks
import {useWindowCommunication} from '../../hooks/useSharedState'
import {useTranscriptionState} from '../../hooks/useTranscriptionState'

// Services and types
import {TranscriptionResult} from '../../services/main-stt-transcription'
import {TranscriptionSource} from '../../services/TranscriptionSourceManager'

// Components
import StreamingTextRenderer from '../../components/StreamingTextRenderer'

export default function TranscriptsPage() {
  // Use only the unified TranscriptionStateManager
  const {
    addTranscript,
    setProcessingState,
    startStreaming,
    updateStreaming,
    completeStreaming,
    isStreamingActive,
    currentStreamingText,
    isCurrentTextPartial,
    streamingMode
  } = useTranscriptionState()
  const {onMessage} = useWindowCommunication()

  // Add state to track if we should accumulate (only complete on manual stop)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const accumulatedTextRef = useRef<string>('')
  const isRecordingActiveRef = useRef<boolean>(false)

  // Memoized function to complete transcription manually (triggered by REC/STOP button)
  const completeCurrentTranscription = useCallback(() => {
    // Add to permanent transcript list only if we have accumulated text
    if (accumulatedTextRef.current.trim()) {
      addTranscript({
        id: `manual-complete-${Date.now()}`,
        text: accumulatedTextRef.current,
        timestamp: Date.now(),
        confidence: 0.95
      })
    }

    // DON'T complete streaming in unified manager - keep current text visible
    // Only reset accumulated text for next recording session
    accumulatedTextRef.current = ''
    isRecordingActiveRef.current = false
  }, [addTranscript])

  // Listen for recording state changes to trigger transcription completion
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'recording-state-changed' && args[0] !== undefined) {
        const isRecording = args[0] as boolean
        
        if (!isRecording && isRecordingActiveRef.current) {
          // Recording stopped - complete the current transcription
          completeCurrentTranscription()
        } else if (isRecording) {
          // Recording started - reset for new session
          accumulatedTextRef.current = ''
          isRecordingActiveRef.current = true
        }
      }
    })

    return unsubscribe
  }, [onMessage, completeCurrentTranscription])

  // Listen for transcription results from CustomTitleBar (main window)
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      
      if (channel === 'transcription-result' && args[0]) {
        const result = args[0] as TranscriptionResult
        addTranscript({
          id: `transcript-${Date.now()}`,
          text: result.text,
          timestamp: Date.now(),
          confidence: result.confidence as number | undefined
        })
        setProcessingState(false)
      } else if (channel === 'streaming-transcription' && args[0]) {
        // Handle live streaming transcriptions for real-time display
        const streamingData = args[0] as {text: string; isFinal: boolean; source: string}

        if (streamingData.text.trim()) {
          // If this is a final transcription, add to permanent list immediately
          if (streamingData.isFinal) {
            
            // Use accumulated text if available, otherwise use the final text
            const finalText = accumulatedTextRef.current.trim() || streamingData.text
            
            // Update accumulated text with final version
            accumulatedTextRef.current = finalText
            
            // Complete the transcription manually (same as REC/STOP)
            completeCurrentTranscription()
          } else {
            // This is a partial/ongoing transcription update
            
            // Always accumulate text during recording
            const currentText = streamingData.text.trim()
            const previousText = accumulatedTextRef.current.trim()
            
            if (!previousText) {
              // First transcription in this session
              accumulatedTextRef.current = currentText
            } else {
              // Check if this text should be appended or if it's a replacement
              if (currentText.startsWith(previousText) || previousText.startsWith(currentText)) {
                // This is an update to the same utterance - use the longer version
                accumulatedTextRef.current = currentText.length > previousText.length ? currentText : previousText
              } else {
                // This is a new utterance - append with space
                accumulatedTextRef.current = previousText + ' ' + currentText
              }
            }
            
            // Update the streaming with accumulated text using unified manager
            updateStreaming(accumulatedTextRef.current, true)

            // Also update the unified TranscriptionStateManager
            if (isStreamingActive) {
              updateStreaming(accumulatedTextRef.current, true)
            } else {
              startStreaming({
                id: `websocket-${Date.now()}`,
                text: accumulatedTextRef.current,
                timestamp: Date.now(),
                isPartial: true,
                confidence: 0.95,
                source: TranscriptionSource.WEBSOCKET_GEMINI
              })
            }
          }
        }
      }
    })

    return unsubscribe
  }, [
    onMessage,
    addTranscript,
    setProcessingState,
    startStreaming,
    updateStreaming,
    isStreamingActive,
    completeStreaming,
    completeCurrentTranscription
  ])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current)
      }
    }
  }, [])

  // Memoized streaming state computation
  const streamingState = useMemo(() => ({
    activeText: currentStreamingText || '',
    isActive: isStreamingActive,
    isPartial: isCurrentTextPartial
  }), [currentStreamingText, isStreamingActive, isCurrentTextPartial])

  // Memoized transcripts for rendering (prevent re-sorts on every render)
  return (
    <div className="flex h-full flex-col">{"\n"}      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{color: 'var(--text-primary)'}}>
            Live Transcriptions
          </h1>
          <p className="text-sm" style={{color: 'var(--text-muted)'}}>
            Real-time transcription results from audio recording
          </p>
        </div>
      </div>

      {/* WebSocket Status Indicator */}
      <div
        className="mb-4 rounded-lg border p-3"
        style={{
          backgroundColor: 'var(--glass-light)',
          borderColor: 'var(--glass-border)',
          color: 'var(--text-primary)'
        }}
      >
        <div className="text-sm">
          <div className="mb-1">
            <strong>WebSocket Status:</strong> Ready
          </div>
          <div className="mb-1">
            <strong>Transcription Mode:</strong> Hybrid (WebSocket + Batch Fallback)
          </div>
          <div className="text-xs" style={{color: 'var(--text-muted)'}}>
            Note: If quota exceeded, system automatically falls back to batch transcription
          </div>
        </div>
      </div>

      {/* Live Streaming Area */}
      <div className="flex-1 overflow-hidden">
        {streamingState.isActive && streamingState.activeText ? (
          <div
            className="h-full rounded-lg border p-4"
            style={{
              backgroundColor: 'var(--glass-light)',
              borderColor: 'var(--glass-border)',
              color: 'var(--text-primary)'
            }}
          >
            <div className="mb-2 text-sm font-medium">
              🔴 Live Streaming {streamingState.isPartial ? '(Partial)' : '(Final)'}
            </div>
            <StreamingTextRenderer
              text={streamingState.activeText}
              isPartial={streamingState.isPartial}
              mode={streamingMode}
            />
          </div>
        ) : (
          <div
            className="flex h-full items-center justify-center rounded-lg border-2 border-dashed"
            style={{
              borderColor: 'var(--glass-border)',
              color: 'var(--text-muted)'
            }}
          >
            <div className="text-center">
              <div className="mb-2 text-4xl opacity-60">🎙️</div>
              <div className="mb-2 text-lg font-medium">Waiting for Audio Input</div>
              <div className="text-sm">
                Start recording or speaking to see live transcriptions appear here
              </div>
              <div className="mt-2 text-xs">WebSocket Connection: Ready</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
