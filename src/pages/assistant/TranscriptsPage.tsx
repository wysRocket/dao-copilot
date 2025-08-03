import React, {useEffect, useRef, useCallback, useMemo} from 'react'

// Local hooks
import {useTranscriptionState} from '../../hooks/useTranscriptionState'

// Services and types
import {TranscriptionResult} from '../../services/main-stt-transcription'
import {TranscriptionSource} from '../../services/TranscriptionSourceManager'

// Components
import StreamingTextRenderer from '../../components/StreamingTextRenderer'

// Extend Window interface for test functions
declare global {
  interface Window {
    testAssistantDisplay: () => void
    testAssistantEmpty: () => void
  }
}

export default function TranscriptsPage() {
  const {
    currentStreamingText,
    isStreamingActive,
    isCurrentTextPartial,
    transcripts,
    startStreaming,
    updateStreaming,
    clearStreaming,
    addTranscript,
    setProcessingState
  } = useTranscriptionState()

  // 🧪 DEBUG: Add a test function to force display
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.testAssistantDisplay = () => {
        console.log('🧪 TESTING: Forcing Assistant window display')
        const testData = {
          id: `test-${Date.now()}`,
          text: 'TEST: This is a forced test to verify Assistant window display pipeline works',
          timestamp: Date.now(),
          isPartial: false,
          confidence: 0.9,
          source: 'test-forced' as TranscriptionSource
        }
        startStreaming(testData)
        console.log('🧪 Test streaming started - check Assistant window')
      }

      window.testAssistantEmpty = () => {
        console.log('🧪 TESTING: Simulating empty WebSocket result')
        const emptyData = {
          id: `empty-test-${Date.now()}`,
          text: '',
          timestamp: Date.now(),
          isPartial: false,
          confidence: 0.8,
          source: 'websocket-streaming' as TranscriptionSource
        }
        startStreaming(emptyData)
        console.log('🧪 Empty test started - should show debug message')
      }
    }
  }, [startStreaming])

  // Clear any existing fake streaming state on mount
  useEffect(() => {
    console.log('🧹 TranscriptsPage mounted - clearing any fake streaming state')
    if (
      isStreamingActive &&
      currentStreamingText &&
      (currentStreamingText.includes('Ready to receive') ||
        currentStreamingText.includes('Initializing') ||
        currentStreamingText.includes('waiting'))
    ) {
      console.log('🧹 Clearing fake streaming state:', currentStreamingText)
      clearStreaming()
    }
  }, [])

  // Add state to track if we should accumulate (only complete on manual stop)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const accumulatedTextRef = useRef<string>('')
  const isRecordingActiveRef = useRef<boolean>(false)

  // Memoized function to complete transcription manually (triggered by REC/STOP button)
  const completeCurrentTranscription = useCallback(() => {
    console.log(
      '🏁 Completing transcription session. Accumulated text:',
      accumulatedTextRef.current
    )

    // Add to permanent transcript list only if we have accumulated text
    if (accumulatedTextRef.current.trim()) {
      addTranscript({
        id: `manual-complete-${Date.now()}`,
        text: accumulatedTextRef.current,
        timestamp: Date.now(),
        confidence: 0.95
      })
      console.log('📋 Added to permanent transcripts:', accumulatedTextRef.current)
    }

    // Clear the streaming session and reset for next recording
    clearStreaming()
    accumulatedTextRef.current = ''
    isRecordingActiveRef.current = false
    console.log('🧹 Cleared streaming session and reset state')
  }, [addTranscript, clearStreaming])

  // Listen for recording state changes to trigger transcription completion
  useEffect(() => {
    const unsubscribe = window.electronWindow.onInterWindowMessage((channel, ...args) => {
      if (channel === 'recording-state-changed' && args[0] !== undefined) {
        const isRecording = args[0] as boolean

        if (!isRecording && isRecordingActiveRef.current) {
          // Recording stopped - complete the current transcription
          completeCurrentTranscription()
        } else if (isRecording) {
          // Recording started - reset for new session
          console.log('🎙️ Recording started - initializing for new session')
          accumulatedTextRef.current = ''
          isRecordingActiveRef.current = true

          // Don't start fake streaming - wait for real transcription data
          console.log('� [DEBUG] Recording active, waiting for real transcription data...')

          // Trigger immediate streaming transcription session
          if (window.electron?.ipcRenderer?.send) {
            window.electron.ipcRenderer.send('start-immediate-streaming', {})
            console.log('🚀 Triggered immediate streaming transcription session')
          } else if (window.electronWindow?.broadcast) {
            window.electronWindow.broadcast('start-immediate-streaming', {})
            console.log('🚀 Triggered immediate streaming via broadcast')
          }

          setProcessingState(true)
        }
      }
    })

    return unsubscribe
  }, [
    completeCurrentTranscription,
    startStreaming,
    updateStreaming,
    setProcessingState,
    isStreamingActive
  ])

  // Listen for transcription results from recording system
  useEffect(() => {
    const unsubscribe = window.electronWindow.onInterWindowMessage((channel, ...args) => {
      // Debug all inter-window messages (reduced logging)
      console.log(
        '📨 [DEBUG] Message received:',
        channel,
        args.length > 0 ? 'with data' : 'no data'
      )

      if (channel === 'transcription-result' && args[0]) {
        console.log('📥 [DEBUG] Processing transcription-result event')
        const result = args[0] as TranscriptionResult
        addTranscript({
          id: `transcript-${Date.now()}`,
          text: result.text,
          timestamp: Date.now(),
          confidence: result.confidence as number | undefined
        })
        setProcessingState(false)
      } else if (channel === 'streaming-transcription' && args[0]) {
        console.log('📥 [DEBUG] Received streaming-transcription event')

        // Handle live streaming transcriptions for real-time display
        const streamingData = args[0] as {
          text: string
          isFinal: boolean
          source: string
          confidence?: number
        }

        console.log('🔴 Received streaming transcription:', streamingData)
        console.log('🔴 [DEBUG] Streaming data details:', {
          hasText: !!streamingData.text,
          textLength: streamingData.text?.length,
          textContent: streamingData.text,
          isFinal: streamingData.isFinal,
          source: streamingData.source,
          confidence: streamingData.confidence
        })

        if (streamingData.text && streamingData.text.trim()) {
          const currentText = streamingData.text.trim()

          // Ensure we have an active streaming session
          console.log('🔍 [DEBUG] Current streaming active state:', isStreamingActive)
          console.log('🔍 [DEBUG] Current streaming text:', currentStreamingText)

          if (!isStreamingActive) {
            console.log('🔄 [DEBUG] No active stream, starting new session for:', currentText)
            // Initialize accumulated text for new session
            accumulatedTextRef.current = currentText

            const sessionData = {
              id: `session-${Date.now()}`,
              text: currentText,
              timestamp: Date.now(),
              isPartial: !streamingData.isFinal, // When isFinal is false, it's partial (true)
              confidence: streamingData.confidence || 0,
              source: streamingData.source as TranscriptionSource
            }
            console.log('🚀 [DEBUG] Creating streaming session with data:', sessionData)
            startStreaming(sessionData)

            // Give it a moment to establish, then check
            setTimeout(() => {
              console.log(
                '🔍 [DEBUG] After startStreaming - isActive:',
                isStreamingActive,
                'text:',
                currentStreamingText
              )
            }, 50)
          } else {
            console.log('✅ [DEBUG] Active stream exists, updating...')

            // For WebSocket streaming or batch interval recording, accumulate the text progressively
            if (
              streamingData.source === 'websocket-streaming' ||
              streamingData.source === 'websocket-streaming-final' ||
              streamingData.source === 'websocket' ||
              streamingData.source === 'batch' ||
              streamingData.source === 'batch-final'
            ) {
              // Find the longest overlap between the end of accumulatedTextRef.current and the start of currentText
              let overlap = 0
              const acc = accumulatedTextRef.current
              for (let i = 1; i <= Math.min(acc.length, currentText.length); i++) {
                if (acc.endsWith(currentText.substring(0, i))) {
                  overlap = i
                }
              }
              const newPart = currentText.substring(overlap)
              if (newPart) {
                accumulatedTextRef.current += (acc ? ' ' : '') + newPart
              }
              console.log('🔗 Updated accumulated text:', accumulatedTextRef.current)
              updateStreaming(accumulatedTextRef.current, streamingData.isFinal ? false : true)
            } else {
              // For non-WebSocket sources, treat as individual transcriptions
              if (streamingData.isFinal) {
                console.log('✅ Final transcription received:', currentText)
                updateStreaming(currentText, false)
                accumulatedTextRef.current = currentText
                console.log(
                  '📌 Final text displayed, keeping session active for continued streaming'
                )
              } else {
                console.log('📝 Partial transcription received:', currentText)
                updateStreaming(currentText, true)
              }
            }
          }
        }
      } else if (channel === 'recording-state-changed') {
        console.log('🎤 [DEBUG] Recording state changed:', args[0])
      } else {
        // Log any other messages for debugging
        console.log('📨 [DEBUG] Unhandled inter-window message:', {channel, args})
      }
    })

    return unsubscribe
  }, [
    addTranscript,
    setProcessingState,
    startStreaming,
    updateStreaming,
    isStreamingActive,
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

  // Memoized streaming state computation with user guidance messages
  const streamingState = useMemo(() => {
    console.log('🔍 [STATE DEBUG] Raw values:', {
      currentStreamingText: `"${currentStreamingText}"`,
      isStreamingActive,
      isCurrentTextPartial,
      textLength: currentStreamingText?.length,
      transcriptsCount: transcripts?.length || 0,
      mostRecentTranscript: transcripts?.[0]?.text?.substring(0, 50) + '...' || 'none',
      timestamp: new Date().toISOString()
    })

    const hasRealText =
      currentStreamingText &&
      currentStreamingText.trim().length > 0 &&
      !currentStreamingText.includes('Ready to receive') &&
      !currentStreamingText.includes('Initializing') &&
      !currentStreamingText.includes('waiting for') &&
      !currentStreamingText.match(/^\.{3,}$/) // Only filter standalone ellipses

    // Check if we have a recent completed transcription (within last 10 seconds)
    const recentTranscript = transcripts?.[0]
    const hasRecentTranscript =
      recentTranscript &&
      recentTranscript.timestamp &&
      Date.now() - recentTranscript.timestamp < 10000 // 10 seconds

    // Show guidance message when recording is active but no transcription is received
    const showGuidanceMessage =
      isStreamingActive &&
      currentStreamingText !== undefined &&
      !hasRealText &&
      !hasRecentTranscript

    // Provide helpful user guidance based on the situation
    let userGuidanceText =
      '🎤 Listening... Please speak clearly and loudly. If you continue to see this message, check your microphone settings.'
    if (showGuidanceMessage && currentStreamingText === '') {
      userGuidanceText =
        '🔍 WebSocket connected and processing. Try speaking louder or closer to your microphone.'
    }

    // Determine what text to show: streaming text, recent transcript, or guidance
    let displayText = ''
    let isPartial = false

    if (hasRealText) {
      displayText = currentStreamingText
      isPartial = isCurrentTextPartial
    } else if (hasRecentTranscript) {
      displayText = recentTranscript.text
      isPartial = false
    } else if (showGuidanceMessage) {
      displayText = userGuidanceText
      isPartial = false
    }

    const state = {
      activeText: displayText,
      // 🔧 FIX: Show transcription text even when streaming is inactive (for completed transcriptions)
      // This ensures final transcription results remain visible after streaming ends
      isActive: hasRealText || hasRecentTranscript || (isStreamingActive && showGuidanceMessage),
      isPartial: isPartial
    }
    console.log('🔍 [DETAILED] Streaming state computed:', {
      isActive: state.isActive,
      isStreamingActiveFromHook: isStreamingActive,
      hasRealText,
      hasRecentTranscript,
      showGuidanceMessage,
      userGuidanceText,
      rawStreamingText: `"${currentStreamingText}"`,
      recentTranscriptText: recentTranscript?.text?.substring(0, 50) + '...' || 'none',
      finalDisplayText: `"${state.activeText}"`,
      textLength: currentStreamingText?.length,
      isPartial: state.isPartial,
      trimmedLength: currentStreamingText?.trim().length,
      includesReadyToReceive: currentStreamingText?.includes('Ready to receive'),
      includesInitializing: currentStreamingText?.includes('Initializing'),
      includesWaiting: currentStreamingText?.includes('waiting for'),
      isStandaloneEllipses: !!currentStreamingText?.match(/^\.{3,}$/),
      // Debug info for the fix
      fixApplied: 'Show text when streaming inactive OR recent transcript available',
      newLogic: 'hasRealText || hasRecentTranscript || (isStreamingActive && showGuidanceMessage)',
      debugCalculation: {
        hasRealText,
        hasRecentTranscript,
        guidanceCondition: isStreamingActive && showGuidanceMessage,
        result: hasRealText || hasRecentTranscript || (isStreamingActive && showGuidanceMessage)
      }
    })
    return state
  }, [currentStreamingText, isStreamingActive, isCurrentTextPartial, transcripts])

  // Default streaming mode
  const streamingMode = 'character'

  // Memoized transcripts for rendering (prevent re-sorts on every render)
  return (
    <div className="flex h-full flex-col">
      {'\n'} {/* Header */}
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
        {(() => {
          console.log(
            '🎬 [RENDER] Rendering decision - isActive:',
            streamingState.isActive,
            'activeText:',
            `"${streamingState.activeText}"`,
            'activeText length:',
            streamingState.activeText?.length,
            'raw isStreamingActive:',
            isStreamingActive,
            'raw currentStreamingText:',
            `"${currentStreamingText}"`,
            'decision timestamp:',
            new Date().toISOString()
          )

          if (streamingState.isActive && streamingState.activeText) {
            console.log('🎬 [RENDER] ✅ SHOWING STREAMING CONTENT - Path A')
            return (
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
                  {!streamingState.isPartial && (
                    <span className="ml-2 text-xs opacity-70">(Auto-completing in 3s)</span>
                  )}
                </div>
                <StreamingTextRenderer
                  text={streamingState.activeText}
                  isPartial={streamingState.isPartial}
                  mode={streamingMode}
                />
              </div>
            )
          } else {
            console.log('🎬 [RENDER] ❌ SHOWING WAITING/READY STATE - Path B - Why?', {
              isActive: streamingState.isActive,
              hasActiveText: !!streamingState.activeText,
              activeText: `"${streamingState.activeText}"`,
              shouldBeActive: streamingState.isActive && streamingState.activeText
            })
            return (
              <div
                className="flex h-full items-center justify-center rounded-lg border-2 border-dashed"
                style={{
                  borderColor: 'var(--glass-border)',
                  color: 'var(--text-muted)'
                }}
              >
                <div className="text-center">
                  <div className="mb-2 text-4xl opacity-60">🎙️</div>
                  <div className="mb-2 text-lg font-medium">
                    {streamingState.isActive
                      ? '🎤 Listening... Please speak clearly and loudly.'
                      : 'Ready to Record'}
                  </div>
                  <div className="text-sm">
                    {streamingState.isActive
                      ? 'If you continue to see this message, check your microphone settings or try speaking louder.'
                      : 'Start recording from the home page to see live transcriptions here'}
                  </div>
                  <div className="mt-2 text-xs opacity-60">WebSocket Connection: Ready</div>
                </div>
              </div>
            )
          }
        })()}
      </div>
    </div>
  )
}
