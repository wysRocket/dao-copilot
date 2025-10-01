import React, {useEffect, useRef, useCallback, useState} from 'react'

// Local hooks
import {useWindowCommunication} from '../../hooks/useSharedState'
import {useTranscriptionState} from '../../hooks/useTranscriptionState'
import {useSharedState} from '../../hooks/useSharedState'
import {useRealTimeTranscription} from '../../hooks/useRealTimeTranscription'

// Services and types
import {TranscriptionResult} from '../../services/main-stt-transcription'
import {TranscriptionSource} from '../../services/TranscriptionSourceManager'
import {useTranscriptStore} from '../../state/transcript-state'
import TranscriptionQuestionBridge from '../../services/TranscriptionQuestionBridge'

// Components
import AccumulativeTranscriptDisplay from '../../components/AccumulativeTranscriptDisplay'
import AnswerDisplayCard from '../../components/AnswerDisplayCard'

export default function TranscriptsPage() {
  console.log('📋 TranscriptsPage component is mounting/rendering')

  // Zero-latency transcription system (runs seamlessly in background)
  const {
    isInitialized,
    start,
    isActive,
    currentTranscript,
    finalTranscripts,
    error: realTimeError
  } = useRealTimeTranscription()

  // Legacy transcription system for fallback
  const {
    addTranscript,
    setProcessingState,
    startStreaming,
    updateStreaming,
    completeStreaming,
    isStreamingActive
  } = useTranscriptionState()

  // Import new transcript store methods for live transcription
  const {addPartialEntry, addFinalEntry} = useTranscriptStore()

  const {onMessage} = useWindowCommunication()
  const {isRecording} = useSharedState()

  // Initialize TranscriptionQuestionBridge for live question detection and answer generation
  const bridgeRef = useRef<TranscriptionQuestionBridge | null>(null)
  const [bridgeInitialized, setBridgeInitialized] = useState(false)

  // Initialize bridge on component mount
  useEffect(() => {
    console.log('🔥 TranscriptsPage useEffect for bridge initialization is executing')
    const initializeBridge = async () => {
      try {
        console.log('🤖 Initializing TranscriptionQuestionBridge...')
        const bridge = new TranscriptionQuestionBridge({
          questionConfidenceThreshold: 0.85,
          questionMinLength: 5,
          contextBufferSize: 10,
          autoGenerateAnswers: true,
          answerTimeoutMs: 30000,
          maxConcurrentAnswers: 2,
          bufferTimeoutMs: 1000,
          enableRealTimeProcessing: true,
          maxProcessingTimeMs: 5000,
          enableDebugLogging: true, // Enable debug logging
          logTranscriptionEvents: true // Enable transcription event logging
        })

        console.log('🔧 Bridge created, now initializing...')
        await bridge.initialize()
        bridgeRef.current = bridge
        setBridgeInitialized(true)
        console.log('✅ TranscriptionQuestionBridge initialized successfully')

        // Listen for question detection events
        bridge.on('question_detected', event => {
          console.log('🔍 Question detected:', event)
        })

        bridge.on('answer_generated', event => {
          console.log('💬 Answer generated:', event)
        })
      } catch (error) {
        console.error('❌ Failed to initialize TranscriptionQuestionBridge:', error)
        console.error('🔍 Error details:', error instanceof Error ? error.stack : String(error))
      }
    }

    initializeBridge()

    // Cleanup on unmount
    return () => {
      if (bridgeRef.current) {
        bridgeRef.current.stop()
        bridgeRef.current = null
        setBridgeInitialized(false)
      }
    }
  }, [])

  // Auto-start zero-latency transcription when component mounts (no-op until user clicks REC)
  useEffect(() => {
    if (isInitialized && !isActive) {
      // Lazy-start; primary trigger is REC button via recording-state-changed
      // Keeping this for resilience after hot-reloads
      start()
    }
  }, [isInitialized, isActive, start])

  // When global recording flips on (shared state), ensure UI shows streaming immediately
  useEffect(() => {
    if (isRecording) {
      try {
        useTranscriptStore.getState().startStreaming()
      } catch {
        // ignore
      }
      if (!isActive) start()
    }
  }, [isRecording, isActive, start])

  // Bridge zero-latency transcription data to transcript store AND process for question detection
  useEffect(() => {
    if (currentTranscript && currentTranscript.trim()) {
      // Add or update partial entry for real-time display
      const partialId = 'realtime-partial'
      console.log('🔄 Zero-latency partial transcript:', {
        text: currentTranscript.trim(),
        textLength: currentTranscript.trim().length,
        confidence: 0.95
      })
      addPartialEntry({
        id: partialId,
        text: currentTranscript.trim(),
        confidence: 0.95
      })

      // Process with TranscriptionQuestionBridge for question detection (partial transcripts)
      if (bridgeRef.current && bridgeInitialized) {
        console.log(
          '🔍 Processing partial transcription for question detection:',
          currentTranscript.trim()
        )
        const transcriptionEvent = {
          id: partialId,
          text: currentTranscript.trim(),
          confidence: 0.95,
          isFinal: false, // This is a partial transcription
          source: 'websocket' as const,
          timestamp: Date.now()
        }

        // Process transcription for question detection
        bridgeRef.current.processTranscription(transcriptionEvent).catch(error => {
          console.warn('🔍 Question bridge processing failed:', error)
        })
      } else {
        console.log(
          '⚠️ Bridge not ready for partial processing - bridgeRef:',
          !!bridgeRef.current,
          'initialized:',
          bridgeInitialized
        )
      }
    }
  }, [currentTranscript, addPartialEntry, bridgeInitialized])

  // Bridge final transcripts to transcript store AND process for question detection
  useEffect(() => {
    if (finalTranscripts.length > 0) {
      const latestFinal = finalTranscripts[finalTranscripts.length - 1]
      if (latestFinal) {
        console.log('✅ Zero-latency final transcript:', {
          text: latestFinal.text,
          textLength: latestFinal.text.length,
          confidence: latestFinal.confidence || 0.95,
          timestamp: latestFinal.timestamp
        })
        // Use the same ID as partial to guarantee clean replacement
        addFinalEntry({
          id: 'realtime-partial',
          text: latestFinal.text,
          confidence: latestFinal.confidence || 0.95
        })

        // Process with TranscriptionQuestionBridge for question detection (final transcripts)
        if (bridgeRef.current && bridgeInitialized) {
          console.log('🔍 Processing final transcription for question detection:', latestFinal.text)
          const transcriptionEvent = {
            id: 'realtime-final',
            text: latestFinal.text,
            confidence: latestFinal.confidence || 0.95,
            isFinal: true, // This is a final transcription
            source: 'websocket' as const,
            timestamp: latestFinal.timestamp || Date.now()
          }

          // Process final transcription for question detection
          bridgeRef.current.processTranscription(transcriptionEvent).catch(error => {
            console.warn('🔍 Question bridge processing failed for final transcript:', error)
          })
        } else {
          console.log(
            '⚠️ Bridge not ready for final processing - bridgeRef:',
            !!bridgeRef.current,
            'initialized:',
            bridgeInitialized
          )
        }

        // Reset session refs
        accumulatedTextRef.current = ''
        currentPartialIdRef.current = null
      }
    }
  }, [finalTranscripts, addFinalEntry, bridgeInitialized])

  // Debug logging for real-time transcription state
  useEffect(() => {
    console.log('🎤 Real-time transcription state:', {
      isInitialized,
      isActive,
      hasCurrentTranscript: !!currentTranscript,
      currentTranscriptLength: currentTranscript?.length || 0,
      finalTranscriptsCount: finalTranscripts.length,
      error: realTimeError
    })
  }, [isInitialized, isActive, currentTranscript, finalTranscripts, realTimeError])

  // Legacy state tracking (for old system)
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const accumulatedTextRef = useRef<string>('')
  const isRecordingActiveRef = useRef<boolean>(false)
  const currentPartialIdRef = useRef<string | null>(null)

  // Auto-start zero-latency system when recording begins and update UI instantly
  useEffect(() => {
    const unsubscribe = onMessage((channel, ...args) => {
      if (channel === 'recording-state-changed' && args[0] !== undefined) {
        const isRecording = args[0] as boolean

        // Start zero-latency transcription when main REC button is pressed
        if (isRecording) {
          // Always show optimistic UI when REC goes on
          try {
            useTranscriptStore.getState().startStreaming()
          } catch {
            // best-effort UI hint; store may not be ready during early init
          }
          if (!isActive) {
            start()
          }
          // Prepare new session identifiers
          accumulatedTextRef.current = ''
          currentPartialIdRef.current = `partial-session-${Date.now()}`
          isRecordingActiveRef.current = true
        }

        // Stop streaming UI when recording stops (if triggered without text)
        if (!isRecording) {
          try {
            useTranscriptStore.getState().stopStreaming()
          } catch {
            // ignore - non-critical UI cleanup
          }
        }
      }
    })

    return unsubscribe
  }, [onMessage, isActive, start])

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
    currentPartialIdRef.current = null // Reset partial ID for next session
    isRecordingActiveRef.current = false
    // Ensure streaming indicator is off
    try {
      useTranscriptStore.getState().stopStreaming()
    } catch {
      // ignore - non-critical UI cleanup
    }
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
          currentPartialIdRef.current = null // Reset partial ID for new session
          isRecordingActiveRef.current = true
        }
      }
    })

    return unsubscribe
  }, [onMessage, completeCurrentTranscription])

  // Listen for transcription results from CustomTitleBar (main window)
  useEffect(() => {
    // Allow IPC streaming even when zero-latency is active if explicitly enabled via env
    const allowIpcWhenActive = (() => {
      try {
        // Vite-style env
        const metaEnv = (import.meta as unknown as {env?: Record<string, string>})?.env
        if (metaEnv && metaEnv.GEMINI_IPC_ALLOW_WHEN_ACTIVE === '1') return true
      } catch {
        /* ignore */
      }
      try {
        // Node-style env (Electron renderer with env passthrough)
        const penv = (process as unknown as {env?: Record<string, string>})?.env
        if (penv && penv.GEMINI_IPC_ALLOW_WHEN_ACTIVE === '1') return true
      } catch {
        /* ignore */
      }
      try {
        // Window-injected env
        const wenv = (globalThis as unknown as {__ENV__?: Record<string, string>})?.__ENV__
        if (wenv && wenv.GEMINI_IPC_ALLOW_WHEN_ACTIVE === '1') return true
      } catch {
        /* ignore */
      }
      return false
    })()

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
        // If zero-latency pipeline is active, ignore duplicate legacy stream to prevent conflicts
        if (isActive && !allowIpcWhenActive) {
          console.log(
            '🔇 Skipping IPC streaming-transcription because zero-latency is active (set GEMINI_IPC_ALLOW_WHEN_ACTIVE=1 to override).'
          )
          return
        }
        // ===== DEBUGGING: TRANSCRIPTS PAGE MESSAGE INTERCEPTION =====
        console.group('📝 TranscriptsPage Message Received')
        console.log('🔍 Channel:', channel)
        console.log('🔍 Args:', args)
        console.log('🔍 First Arg:', args[0])

        // Handle live streaming transcriptions for real-time display (user speech only)
        const streamingData = args[0] as {text: string; isFinal: boolean; source: string}

        console.log('🔍 Parsed streaming data:', streamingData)
        console.log('🔍 Text content preview:', streamingData.text?.substring(0, 200) + '...')
        console.log(
          '🔍 Text contains "Charlie Kirk":',
          streamingData.text?.includes('Charlie Kirk')
        )
        console.log('🔍 Text contains "news":', streamingData.text?.toLowerCase().includes('news'))
        console.groupEnd()

        // ===== EMERGENCY CONTENT FILTERING =====
        const searchIndicators = [
          'assassination of charlie kirk',
          'latest news',
          "here's a summary",
          'conservative activist',
          'trump ally',
          'international news',
          'notable news',
          'supreme court',
          'manhunt is underway'
        ]

        const textLower = streamingData.text?.toLowerCase() || ''
        const isSearchResult = searchIndicators.some(indicator => textLower.includes(indicator))

        if (isSearchResult) {
          console.warn('🚨 EMERGENCY FILTER: Blocking search result from TranscriptsPage!')
          console.warn('🚨 Detected content:', streamingData.text?.substring(0, 100) + '...')
          console.warn('🚨 This should be going to ChatPage instead!')
          return // Block this content from appearing in transcriptions
        }

        // Debug logging to understand what we're receiving
        console.log('📝 Received streaming transcription:', {
          text: streamingData.text,
          isFinal: streamingData.isFinal,
          source: streamingData.source,
          currentAccumulated: accumulatedTextRef.current
        })

        if (streamingData.text.trim()) {
          // If this is a final transcription, add to permanent list immediately
          if (streamingData.isFinal) {
            // Use accumulated text if available, otherwise use the final text
            const finalText = accumulatedTextRef.current.trim() || streamingData.text

            // Update accumulated text with final version
            accumulatedTextRef.current = finalText

            // If we have a partial entry, clear it before adding the final one
            if (currentPartialIdRef.current) {
              // Remove the partial entry since we're finalizing
              // The new transcript store should handle this automatically
              currentPartialIdRef.current = null
            }

            // Use new addFinalEntry method for proper transcript state management
            addFinalEntry({
              text: finalText,
              confidence: 0.95,
              id: currentPartialIdRef.current || `final-${Date.now()}`
            })

            // Complete the transcription manually (same as REC/STOP)
            completeCurrentTranscription()
          } else {
            // This is a partial/ongoing transcription update
            const currentText = streamingData.text.trim()

            // Use consistent partial ID for the entire transcription session
            if (!currentPartialIdRef.current) {
              currentPartialIdRef.current = `partial-session-${Date.now()}`
            }

            // Handle different Gemini Live API accumulation patterns
            let textToDisplay = currentText

            // If previous text exists, check if we need to accumulate or replace
            if (accumulatedTextRef.current.trim()) {
              const prevText = accumulatedTextRef.current.trim()

              // If current text already contains the previous text, it's a full update
              if (currentText.includes(prevText)) {
                textToDisplay = currentText
              }
              // If previous text contains current text, keep the longer one
              else if (prevText.includes(currentText)) {
                textToDisplay = prevText
              }
              // If they're different and neither contains the other, append them
              else if (currentText !== prevText) {
                textToDisplay = prevText + ' ' + currentText
              }
            }

            // Update our accumulated text reference
            accumulatedTextRef.current = textToDisplay

            // Debug the accumulation process
            console.log('🔄 Text accumulation:', {
              originalText: currentText,
              previousText: accumulatedTextRef.current,
              finalTextToDisplay: textToDisplay,
              partialId: currentPartialIdRef.current
            })

            // Use addPartialEntry with consistent ID - this will update the existing entry
            addPartialEntry({
              text: textToDisplay,
              confidence: 0.95,
              id: currentPartialIdRef.current
            })

            // Update unified TranscriptionStateManager for real-time display
            if (isStreamingActive) {
              updateStreaming(textToDisplay, true)
            } else {
              startStreaming({
                id: currentPartialIdRef.current,
                text: textToDisplay,
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
    completeCurrentTranscription,
    isActive
  ])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current)
      }
    }
  }, [])

  // Memoized transcripts for rendering (prevent re-sorts on every render)
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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

      {/* Answer Display Card - Shows persistent answer state */}
      <div className="mb-4">
        <AnswerDisplayCard
          showOnlyWithAnswer={true}
          compact={true}
          className="w-full"
          maxHeight="max-h-32"
        />
      </div>

      {/* Enhanced Transcript Display */}
      <div className="flex-1 overflow-hidden">
        <AccumulativeTranscriptDisplay
          className="h-full"
          showHeader={false}
          showStatus={false}
          maxHeight="100%"
        />
      </div>
    </div>
  )
}
